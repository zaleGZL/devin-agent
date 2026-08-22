import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { listWorkspaceChanges, parsePorcelainStatus, readWorkspaceDiff } from "./git-changes";

const execFileAsync = promisify(execFile);

describe("parsePorcelainStatus", () => {
  it("parses staged, working-tree, untracked, and conflict states", () => {
    expect(parsePorcelainStatus([
      " M src/app.ts",
      "A  src/new.ts",
      "?? notes.txt",
      "UU src/conflict.ts",
      "",
    ].join("\0"))).toEqual([
      expect.objectContaining({ path: "src/app.ts", kind: "modified", staged: false, unstaged: true }),
      expect.objectContaining({ path: "src/new.ts", kind: "added", staged: true, unstaged: false }),
      expect.objectContaining({ path: "notes.txt", kind: "untracked", staged: false, unstaged: true }),
      expect.objectContaining({ path: "src/conflict.ts", kind: "conflicted", staged: true, unstaged: true }),
    ]);
  });

  it("keeps both paths for a porcelain v1 rename record", () => {
    expect(parsePorcelainStatus("R  src/new.ts\0src/old.ts\0")).toEqual([
      expect.objectContaining({ path: "src/new.ts", oldPath: "src/old.ts", kind: "renamed" }),
    ]);
  });

  it("lists a real working-tree change and returns its read-only diff", async () => {
    const repository = await fsp.mkdtemp(path.join(os.tmpdir(), "devin-agent-changes-"));
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: repository });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repository });
      await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repository });
      await fsp.writeFile(path.join(repository, "example.ts"), "export const value = 1;\n");
      await execFileAsync("git", ["add", "example.ts"], { cwd: repository });
      await execFileAsync("git", ["commit", "-qm", "initial"], { cwd: repository });
      await fsp.writeFile(path.join(repository, "example.ts"), "export const value = 2;\n");

      const snapshot = await listWorkspaceChanges(repository);
      expect(snapshot.isRepository).toBe(true);
      expect(snapshot.changes).toEqual([expect.objectContaining({ path: "example.ts", kind: "modified" })]);

      const diff = await readWorkspaceDiff(repository, "example.ts");
      expect(diff.content).toContain("-export const value = 1;");
      expect(diff.content).toContain("+export const value = 2;");
      expect(diff.truncated).toBe(false);
    } finally {
      await fsp.rm(repository, { recursive: true, force: true });
    }
  });
});
