export const MENTION_PATH_MAX_LENGTH = 4_096;
export const MENTION_QUERY_MAX_LENGTH = 240;
export const MENTION_RESULT_LIMIT = 100;

export type MentionKind = "file" | "directory" | "skill";
export type WorkspaceMentionKind = Exclude<MentionKind, "skill">;
export type WorkspaceMentionSearchKind = WorkspaceMentionKind | "all";

interface MentionRefBase {
  id: string;
  kind: MentionKind;
  label: string;
}

export interface FileMentionRef extends MentionRefBase {
  kind: "file";
  /** Workspace-relative POSIX-style path. */
  path: string;
  size?: number;
  mimeType?: string;
  sensitive?: boolean;
}

export interface DirectoryMentionRef extends MentionRefBase {
  kind: "directory";
  /** Workspace-relative POSIX-style path without a trailing slash. */
  path: string;
}

export interface SkillMentionRef extends MentionRefBase {
  kind: "skill";
  /** Canonical Devin Skill name without an @skills: prefix. */
  command: string;
  description?: string;
  scope?: "global" | "project";
  source?: string;
  /** Other discovered files that declare the same invocation command. */
  conflictingSources?: readonly string[];
}

export type MentionRef = FileMentionRef | DirectoryMentionRef | SkillMentionRef;

export interface MentionSearchRequest {
  workspacePath: string;
  kind: WorkspaceMentionSearchKind;
  query: string;
  limit?: number;
}

export interface SkillListRequest {
  workspacePath?: string;
  sessionId?: string;
  refresh?: boolean;
}

export interface MentionSearchResult {
  kind: WorkspaceMentionKind;
  path: string;
  label: string;
  detail: string;
  size?: number;
  sensitive?: boolean;
}

export function isMentionRef(value: unknown): value is MentionRef {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") return false;
  if (value.id.length < 1 || value.id.length > 200 || value.label.length < 1 || value.label.length > 500) return false;
  if (value.kind === "file" || value.kind === "directory") {
    return typeof value.path === "string" && value.path.length > 0 && value.path.length <= MENTION_PATH_MAX_LENGTH;
  }
  return value.kind === "skill"
    && typeof value.command === "string"
    && value.command.length > 0
    && value.command.length <= 500
    && (value.description === undefined || (typeof value.description === "string" && value.description.length <= 2_000))
    && (value.scope === undefined || value.scope === "global" || value.scope === "project")
    && (value.source === undefined || (typeof value.source === "string" && value.source.length <= MENTION_PATH_MAX_LENGTH))
    && (value.conflictingSources === undefined || (
      Array.isArray(value.conflictingSources)
      && value.conflictingSources.length <= 32
      && value.conflictingSources.every((source) => typeof source === "string" && source.length > 0 && source.length <= MENTION_PATH_MAX_LENGTH)
    ));
}

export function parseMentionRefs(value: unknown, maxItems = MENTION_RESULT_LIMIT): MentionRef[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error("Invalid mention references");
  if (!value.every(isMentionRef)) throw new Error("Invalid mention reference");
  const skills = value.filter((mention) => mention.kind === "skill");
  if (skills.length > 1) throw new Error("Only one Skill can be attached to a prompt");
  return value.map((mention) => ({ ...mention }));
}

export function parseMentionSearchRequest(value: unknown): MentionSearchRequest {
  if (!isRecord(value)) throw new Error("Invalid mention search request");
  const { workspacePath, kind, query, limit } = value;
  if (typeof workspacePath !== "string" || workspacePath.length < 1 || workspacePath.length > MENTION_PATH_MAX_LENGTH) {
    throw new Error("Invalid mention workspace path");
  }
  if (kind !== "file" && kind !== "directory" && kind !== "all") throw new Error("Invalid mention search kind");
  if (typeof query !== "string" || query.length > MENTION_QUERY_MAX_LENGTH) throw new Error("Invalid mention search query");
  if (limit !== undefined && (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > MENTION_RESULT_LIMIT)) {
    throw new Error("Invalid mention search limit");
  }
  return { workspacePath, kind, query, ...(limit === undefined ? {} : { limit: Number(limit) }) };
}

export function parseSkillListRequest(value: unknown): SkillListRequest {
  if (!isRecord(value)) throw new Error("Invalid Skill list request");
  const { workspacePath, sessionId, refresh } = value;
  if (workspacePath !== undefined && (typeof workspacePath !== "string" || workspacePath.length < 1 || workspacePath.length > MENTION_PATH_MAX_LENGTH)) {
    throw new Error("Invalid Skill workspace path");
  }
  if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > 200)) {
    throw new Error("Invalid Skill session id");
  }
  if (refresh !== undefined && typeof refresh !== "boolean") throw new Error("Invalid Skill refresh flag");
  return {
    ...(workspacePath === undefined ? {} : { workspacePath }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(refresh === undefined ? {} : { refresh }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
