import path from "node:path";
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { MentionSearchResult, WorkspaceMentionSearchKind } from "../shared/mentions";

const MAX_CANDIDATES = 100_000;
const MAX_RESULTS = 100;
const IGNORED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", "node_modules", ".next", ".nuxt", ".turbo", ".cache",
  "dist", "build", "coverage", "target", "out", ".venv", "venv", "__pycache__",
]);

interface WorkspaceIndex {
  root: string;
  files: string[];
  directories: string[];
}

export class MentionIndex {
  private readonly cache = new Map<string, Promise<WorkspaceIndex>>();
  private readonly versions = new Map<string, number>();
  private globalVersion = 0;

  invalidate(root?: string): void {
    if (root) {
      const cacheKey = path.resolve(root);
      this.versions.set(cacheKey, (this.versions.get(cacheKey) ?? 0) + 1);
      this.cache.delete(cacheKey);
      return;
    }
    this.globalVersion += 1;
    this.cache.clear();
  }

  async refresh(root: string): Promise<void> {
    this.invalidate(root);
    await this.load(root);
  }

  async search(
    root: string,
    kind: WorkspaceMentionSearchKind,
    query: string,
    limit = MAX_RESULTS,
    signal?: AbortSignal,
  ): Promise<MentionSearchResult[]> {
    const cacheKey = path.resolve(root);
    const version = this.versions.get(cacheKey) ?? 0;
    const globalVersion = this.globalVersion;
    const index = await this.load(cacheKey);
    if (
      signal?.aborted
      || version !== (this.versions.get(cacheKey) ?? 0)
      || globalVersion !== this.globalVersion
    ) throw abortError();
    const candidates = kind === "file"
      ? index.files.map((relativePath) => ({ kind: "file" as const, path: relativePath }))
      : kind === "directory"
        ? index.directories.map((relativePath) => ({ kind: "directory" as const, path: relativePath }))
        : [
            ...index.files.map((relativePath) => ({ kind: "file" as const, path: relativePath })),
            ...index.directories.map((relativePath) => ({ kind: "directory" as const, path: relativePath })),
          ];
    return rankMentionCandidates(candidates, query, Math.min(limit, MAX_RESULTS)).map((candidate) => ({
      kind: candidate.kind,
      path: candidate.path,
      label: path.posix.basename(candidate.path),
      detail: candidate.kind === "directory" ? `${candidate.path}/` : candidate.path,
      ...(candidate.kind === "file" && isSensitiveMentionPath(candidate.path) ? { sensitive: true } : {}),
    }));
  }

  private async load(root: string): Promise<WorkspaceIndex> {
    const cacheKey = path.resolve(root);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const pending = (async () => {
      const gitFiles = await listGitFiles(cacheKey);
      const scanned = gitFiles ? undefined : await scanWorkspace(cacheKey);
      const files = [...new Set(gitFiles ?? scanned?.files ?? [])].sort();
      const directories = gitFiles ? collectDirectories(files) : scanned?.directories ?? [];
      return { root: cacheKey, files, directories };
    })();
    this.cache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      if (this.cache.get(cacheKey) === pending) this.cache.delete(cacheKey);
      throw error;
    }
  }
}

export async function listGitFiles(root: string, signal?: AbortSignal): Promise<string[] | undefined> {
  try {
    const output = await execFileText("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], signal);
    return output.split("\0").filter(Boolean).slice(0, MAX_CANDIDATES).map(normalizeRelativePath).filter(Boolean);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    return undefined;
  }
}

export async function walkWorkspace(root: string, signal?: AbortSignal): Promise<string[]> {
  return (await scanWorkspace(root, signal)).files;
}

async function scanWorkspace(root: string, signal?: AbortSignal): Promise<{ files: string[]; directories: string[] }> {
  const files: string[] = [];
  const directories: string[] = [];
  const pending = [""];
  while (pending.length > 0 && files.length + directories.length < MAX_CANDIDATES) {
    if (signal?.aborted) throw abortError();
    const relativeDirectory = pending.shift()!;
    const absoluteDirectory = path.join(root, relativeDirectory);
    let entries: Dirent<string>[];
    try {
      entries = await fsp.readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length + directories.length >= MAX_CANDIDATES) break;
      if (entry.isSymbolicLink()) continue;
      const relativePath = normalizeRelativePath(path.join(relativeDirectory, entry.name));
      if (!relativePath) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          directories.push(relativePath);
          pending.push(relativePath);
        }
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  return { files, directories };
}

export function collectDirectories(files: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const file of files) {
    let directory = path.posix.dirname(file);
    while (directory && directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return [...directories].sort();
}

export function rankMentionPaths(paths: readonly string[], query: string, limit = MAX_RESULTS): string[] {
  return rankMentionCandidates(paths.map((candidate) => ({ kind: "file" as const, path: candidate })), query, limit)
    .map((candidate) => candidate.path);
}

function rankMentionCandidates<T extends { path: string }>(candidates: readonly T[], query: string, limit: number): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return candidates
    .flatMap((candidate, index) => {
      const haystack = candidate.path.toLocaleLowerCase();
      const basename = path.posix.basename(haystack);
      const score = fuzzyScore(haystack, basename, needle);
      return score === undefined ? [] : [{ candidate, score, index }];
    })
    .sort((left, right) => left.score - right.score || left.candidate.path.length - right.candidate.path.length || left.index - right.index)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function isSensitiveMentionPath(relativePath: string): boolean {
  const name = path.posix.basename(relativePath).toLowerCase();
  return name === ".env"
    || name.startsWith(".env.")
    || /(^|[._-])(credential|credentials|secret|secrets|token|tokens|password|passwd)([._-]|$)/i.test(name)
    || /\.(pem|key|p12|pfx|keystore)$/i.test(name);
}

function fuzzyScore(pathValue: string, basename: string, query: string): number | undefined {
  if (!query) return 10_000;
  if (basename === query) return 0;
  if (basename.startsWith(query)) return 10;
  const basenameIndex = basename.indexOf(query);
  if (basenameIndex >= 0) return 20 + basenameIndex;
  const pathIndex = pathValue.indexOf(query);
  if (pathIndex >= 0) return 100 + pathIndex;
  let cursor = 0;
  let gap = 0;
  for (const character of query) {
    const next = pathValue.indexOf(character, cursor);
    if (next < 0) return undefined;
    gap += next - cursor;
    cursor = next + 1;
  }
  return 1_000 + gap;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll(path.sep, "/").replace(/^\.\//, "");
  return normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized) ? "" : normalized;
}

function execFileText(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(stdout);
    });
    const abort = () => {
      child.kill();
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Mention search cancelled");
  error.name = "AbortError";
  return error;
}
