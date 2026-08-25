import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import type { Dirent, Stats } from "node:fs";
import type { SkillMentionRef } from "../shared/mentions";

const MAX_FRONTMATTER_BYTES = 64 * 1024;

export const PROJECT_SKILL_ROOTS = [
  ".agents/skills",
  ".devin/skills",
  ".github/skills",
  ".claude/skills",
  ".cursor/skills",
  ".codex/skills",
  ".cognition/skills",
  ".windsurf/skills",
  ".codeium/skills",
] as const;

export const GLOBAL_SKILL_ROOTS = [
  ".agents/skills",
  ".config/devin/skills",
  ".codeium/windsurf/skills",
  ".codeium/windsurf-next/skills",
  ".codeium/windsurf-insiders/skills",
] as const;

export class SkillIndex {
  private readonly draftCache = new Map<string, Promise<readonly SkillMentionRef[]>>();
  private readonly sessionCache = new Map<string, readonly SkillMentionRef[]>();

  constructor(private readonly homeDirectory = os.homedir()) {}

  listDraft(workspaceRoot?: string): Promise<readonly SkillMentionRef[]> {
    const key = cacheKey(workspaceRoot);
    const cached = this.draftCache.get(key);
    if (cached) return cached;
    const pending = this.scan(workspaceRoot);
    this.draftCache.set(key, pending);
    void pending.catch(() => {
      if (this.draftCache.get(key) === pending) this.draftCache.delete(key);
    });
    return pending;
  }

  async refreshDraft(workspaceRoot?: string): Promise<readonly SkillMentionRef[]> {
    const key = cacheKey(workspaceRoot);
    this.draftCache.delete(key);
    return this.listDraft(workspaceRoot);
  }

  async bindSession(
    sessionId: string,
    workspaceRoot?: string,
    prepared?: readonly SkillMentionRef[],
  ): Promise<readonly SkillMentionRef[]> {
    const existing = this.sessionCache.get(sessionId);
    if (existing) return existing;
    const snapshot = freezeSkills(prepared ?? await this.scan(workspaceRoot));
    this.sessionCache.set(sessionId, snapshot);
    return snapshot;
  }

  setSessionSnapshot(sessionId: string, skills: readonly SkillMentionRef[]): readonly SkillMentionRef[] {
    const snapshot = freezeSkills(skills);
    this.sessionCache.set(sessionId, snapshot);
    return snapshot;
  }

  getSession(sessionId: string): readonly SkillMentionRef[] | undefined {
    return this.sessionCache.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }

  private async scan(workspaceRoot?: string): Promise<readonly SkillMentionRef[]> {
    const global = await scanSkillRoots(
      this.homeDirectory,
      GLOBAL_SKILL_ROOTS,
      "global",
      (relativePath) => `~/${relativePath}`,
    );
    const merged = new Map(global.map((skill) => [normalizeSkillName(skill.command), skill]));
    if (workspaceRoot) {
      const project = await scanSkillRoots(
        workspaceRoot,
        PROJECT_SKILL_ROOTS,
        "project",
        (relativePath) => relativePath,
      );
      for (const skill of project) merged.set(normalizeSkillName(skill.command), skill);
    }
    return freezeSkills([...merged.values()].sort((left, right) => left.label.localeCompare(right.label)));
  }
}

export async function scanSkillRoots(
  baseDirectory: string,
  roots: readonly string[],
  scope: "global" | "project",
  displayPath: (relativePath: string) => string,
): Promise<SkillMentionRef[]> {
  const found = new Map<string, SkillMentionRef>();
  for (const root of roots) {
    const absoluteRoot = path.join(baseDirectory, root);
    let entries: Dirent<string>[];
    try {
      entries = await fsp.readdir(absoluteRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const skillFile = path.join(absoluteRoot, entry.name, "SKILL.md");
      let stat: Stats;
      try {
        stat = await fsp.lstat(skillFile);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const metadata = await readSkillMetadata(skillFile);
      // Devin uses the containing directory as the invocation identifier.
      // Frontmatter `name` is presentation metadata and may contain spaces.
      const command = normalizeSkillCommand(entry.name);
      if (!command) continue;
      const key = normalizeSkillName(command);
      if (found.has(key)) continue;
      const relativeFile = path.posix.join(root, entry.name, "SKILL.md");
      found.set(key, {
        id: `skill:${key}`,
        kind: "skill",
        command,
        label: metadata.name || entry.name,
        ...(metadata.description ? { description: metadata.description } : {}),
        scope,
        source: displayPath(relativeFile),
      });
    }
  }
  return [...found.values()];
}

export async function readSkillMetadata(filePath: string): Promise<{ name?: string; description?: string }> {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_FRONTMATTER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseSkillFrontmatter(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}

export function parseSkillFrontmatter(source: string): { name?: string; description?: string } {
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return {};
  const lines = normalized.slice(4, end).split("\n");
  const result: { name?: string; description?: string } = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const field = match[1];
    let value = match[2]?.trim() ?? "";
    if (/^[>|][+-]?$/.test(value) && field === "description") {
      const block: string[] = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1] ?? "")) {
        block.push((lines[index + 1] ?? "").trim());
        index += 1;
      }
      value = block.filter(Boolean).join(" ");
    }
    value = unquoteYamlScalar(value);
    if (!value) continue;
    if (field === "name") result.name = value.slice(0, 200);
    if (field === "description") result.description = value.slice(0, 2_000);
  }
  return result;
}

function normalizeSkillCommand(value: string): string {
  return value.trim().replace(/^@skills:/i, "").replace(/^\//, "").trim().slice(0, 200);
}

function normalizeSkillName(value: string): string {
  return normalizeSkillCommand(value).toLocaleLowerCase();
}

function unquoteYamlScalar(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1).trim();
  }
  return value.trim();
}

function cacheKey(workspaceRoot?: string): string {
  return workspaceRoot ? path.resolve(workspaceRoot) : "<global>";
}

function freezeSkills(skills: readonly SkillMentionRef[]): readonly SkillMentionRef[] {
  return Object.freeze(skills.map((skill) => Object.freeze({ ...skill })));
}
