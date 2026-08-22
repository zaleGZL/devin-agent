import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import type { WorkspaceChange, WorkspaceChanges, WorkspaceDiff } from "../shared/types";
import { isPathInside } from "./desktop-security";

const MAX_GIT_OUTPUT = 8 * 1024 * 1024;
const MAX_DIFF_LENGTH = 2 * 1024 * 1024;

type GitResult = { stdout: string; stderr: string; exitCode: number };

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["--no-optional-locks", "-c", "core.quotepath=false", "-c", "color.ui=false", ...args],
      { cwd, encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT, timeout: 10_000 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }
        const exitCode = typeof error.code === "number" ? error.code : -1;
        if (exitCode >= 0) {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode });
          return;
        }
        reject(error);
      },
    );
  });
}

const CONFLICT_STATUSES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function changeKind(indexStatus: string, workingTreeStatus: string): WorkspaceChange["kind"] {
  const combined = `${indexStatus}${workingTreeStatus}`;
  if (combined === "??") return "untracked";
  if (CONFLICT_STATUSES.has(combined)) return "conflicted";
  if (combined.includes("R")) return "renamed";
  if (combined.includes("C")) return "copied";
  if (combined.includes("D")) return "deleted";
  if (combined.includes("A")) return "added";
  return "modified";
}

export function parsePorcelainStatus(output: string): WorkspaceChange[] {
  const records = output.split("\0");
  const changes: WorkspaceChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const indexStatus = record[0] ?? " ";
    const workingTreeStatus = record[1] ?? " ";
    if (`${indexStatus}${workingTreeStatus}` === "!!") continue;
    const filePath = record.slice(3);
    const renamedOrCopied = indexStatus === "R" || indexStatus === "C" || workingTreeStatus === "R" || workingTreeStatus === "C";
    const oldPath = renamedOrCopied ? records[index + 1] : undefined;
    if (renamedOrCopied) index += 1;
    changes.push({
      path: filePath,
      ...(oldPath ? { oldPath } : {}),
      kind: changeKind(indexStatus, workingTreeStatus),
      indexStatus,
      workingTreeStatus,
      staged: indexStatus !== " " && indexStatus !== "?",
      unstaged: workingTreeStatus !== " ",
    });
  }
  return changes;
}

export async function listWorkspaceChanges(workspacePath: string): Promise<WorkspaceChanges> {
  const repository = await runGit(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (repository.exitCode !== 0) {
    return { workspacePath, isRepository: false, changes: [], checkedAt: new Date().toISOString() };
  }
  const branch = await runGit(workspacePath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const status = await runGit(workspacePath, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
  if (status.exitCode !== 0) throw new Error(status.stderr.trim() || "Unable to read Git changes");
  return {
    workspacePath,
    repositoryRoot: repository.stdout.trim(),
    ...(branch.exitCode === 0 && branch.stdout.trim() ? { branch: branch.stdout.trim() } : {}),
    isRepository: true,
    changes: parsePorcelainStatus(status.stdout),
    checkedAt: new Date().toISOString(),
  };
}

function resolveWorkspaceChangePath(workspacePath: string, filePath: string): string {
  const resolved = path.resolve(workspacePath, filePath);
  if (!isPathInside(workspacePath, resolved)) throw new Error("The changed file is outside the current workspace");
  return resolved;
}

async function untrackedDiff(workspacePath: string, change: WorkspaceChange): Promise<{ content: string; binary: boolean }> {
  const requestedPath = resolveWorkspaceChangePath(workspacePath, change.path);
  const filePath = await fsp.realpath(requestedPath);
  if (!isPathInside(workspacePath, filePath)) throw new Error("The changed file resolves outside the current workspace");
  const buffer = await fsp.readFile(filePath);
  if (buffer.includes(0)) return { content: `Binary file ${change.path} is not shown.`, binary: true };
  const text = buffer.toString("utf8");
  const lines = text.length === 0 ? [] : text.replace(/\n$/, "").split("\n");
  const header = [
    `diff --git a/${change.path} b/${change.path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${change.path}`,
    `@@ -0,0 +1,${lines.length} @@`,
  ];
  return { content: [...header, ...lines.map((line) => `+${line}`)].join("\n"), binary: false };
}

async function trackedDiff(workspacePath: string, change: WorkspaceChange): Promise<{ content: string; binary: boolean }> {
  const pathspecs = change.oldPath ? [change.oldPath, change.path] : [change.path];
  const combined = await runGit(workspacePath, ["diff", "--no-ext-diff", "--no-color", "--unified=3", "HEAD", "--", ...pathspecs]);
  let content = combined.stdout;
  if (combined.exitCode !== 0) {
    const staged = await runGit(workspacePath, ["diff", "--cached", "--no-ext-diff", "--no-color", "--unified=3", "--", ...pathspecs]);
    const unstaged = await runGit(workspacePath, ["diff", "--no-ext-diff", "--no-color", "--unified=3", "--", ...pathspecs]);
    if (staged.exitCode !== 0 && unstaged.exitCode !== 0) {
      throw new Error(staged.stderr.trim() || unstaged.stderr.trim() || "Unable to read Git diff");
    }
    content = [staged.stdout, unstaged.stdout].filter(Boolean).join("\n");
  }
  return { content: content || `No textual diff is available for ${change.path}.`, binary: /(^|\n)Binary files? /m.test(content) };
}

export async function readWorkspaceDiff(workspacePath: string, requestedPath: string): Promise<WorkspaceDiff> {
  const snapshot = await listWorkspaceChanges(workspacePath);
  if (!snapshot.isRepository) throw new Error("The selected project is not a Git repository");
  const change = snapshot.changes.find((candidate) => candidate.path === requestedPath);
  if (!change) throw new Error("This file is no longer changed");
  resolveWorkspaceChangePath(workspacePath, change.path);
  const result = change.kind === "untracked" ? await untrackedDiff(workspacePath, change) : await trackedDiff(workspacePath, change);
  const truncated = result.content.length > MAX_DIFF_LENGTH;
  return {
    change,
    content: truncated ? `${result.content.slice(0, MAX_DIFF_LENGTH)}\n\n… Diff truncated …` : result.content,
    binary: result.binary,
    truncated,
  };
}
