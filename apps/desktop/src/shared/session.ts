import type { DevinCapabilities } from "./capabilities";

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  title: string;
  updatedAt?: number;
  createdAt?: number;
  locked?: boolean;
  additionalDirectories: string[];
  /** Server-provided opaque metadata is kept for diagnostics only. */
  raw?: unknown;
}

export interface SessionGroup {
  cwd: string;
  sessions: SessionSummary[];
}

export interface SessionSearchResult {
  groups: SessionGroup[];
  total: number;
}

export interface SessionUiOverlay {
  sessionId: string;
  pinned?: boolean;
  archived?: boolean;
  lastOpenedAt?: number;
}

export interface LocalSessionIndex {
  overlays: Record<string, SessionUiOverlay>;
  recentWorkspaces: string[];
}

export interface SessionOperationGate {
  list: boolean;
  load: boolean;
  create: boolean;
  remove: boolean;
  resume: boolean;
  close: boolean;
  additionalDirectories: boolean;
}

export function sessionOperationGate(capabilities: DevinCapabilities): SessionOperationGate {
  return {
    list: capabilities.session.list === true,
    load: capabilities.session.load === true,
    create: capabilities.session.new !== false,
    remove: capabilities.session.delete === true,
    resume: capabilities.session.resume === true,
    close: capabilities.session.close === true,
    additionalDirectories: capabilities.session.additionalDirectories === true,
  };
}

export function normalizeSessionSummary(value: unknown): SessionSummary | undefined {
  if (!isRecord(value)) return undefined;
  const sessionId = stringValue(value.sessionId ?? value.id).trim();
  const cwd = normalizeCwd(stringValue(value.cwd ?? value.workdir ?? value.workspace));
  if (!sessionId || !cwd) return undefined;
  const title = stringValue(value.title ?? value.name).trim() || sessionId;
  const updatedAt = normalizeTimestamp(value.updatedAt ?? value.updated_at ?? value.modified);
  const createdAt = normalizeTimestamp(value.createdAt ?? value.created_at);
  const additionalDirectories = Array.isArray(value.additionalDirectories)
    ? value.additionalDirectories.filter((entry): entry is string => typeof entry === "string").map(normalizeCwd).filter(Boolean)
    : [];
  const metaLocked = isRecord(value._meta)
    ? typeof value._meta["cognition.ai/isLocked"] === "boolean"
      ? value._meta["cognition.ai/isLocked"]
      : typeof value._meta.isLocked === "boolean"
        ? value._meta.isLocked
        : undefined
    : undefined;
  const locked = typeof value.locked === "boolean" ? value.locked : typeof value.isLocked === "boolean" ? value.isLocked : metaLocked;
  return { sessionId, cwd, title, ...(updatedAt !== undefined ? { updatedAt } : {}), ...(createdAt !== undefined ? { createdAt } : {}), ...(locked !== undefined ? { locked } : {}), additionalDirectories, raw: value };
}

export function normalizeSessionSummaries(values: unknown): SessionSummary[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const summary = normalizeSessionSummary(value);
    if (!summary || seen.has(summary.sessionId)) return [];
    seen.add(summary.sessionId);
    return [summary];
  }).sort(compareSession);
}

export function groupSessions(sessions: SessionSummary[]): SessionGroup[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const session of [...sessions].sort(compareSession)) {
    const existing = groups.get(session.cwd);
    if (existing) existing.push(session);
    else groups.set(session.cwd, [session]);
  }
  return [...groups.entries()].map(([cwd, grouped]) => ({ cwd, sessions: grouped }));
}

export function searchSessions(sessions: SessionSummary[], query: string): SessionSearchResult {
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? sessions.filter((session) => `${session.title}\n${session.cwd}\n${session.sessionId}`.toLocaleLowerCase().includes(normalized))
    : sessions;
  const groups = groupSessions(filtered);
  return { groups, total: filtered.length };
}

export function createLocalSessionIndex(initial: Partial<LocalSessionIndex> = {}): LocalSessionIndex {
  return {
    overlays: { ...(initial.overlays ?? {}) },
    recentWorkspaces: dedupePaths(initial.recentWorkspaces ?? []),
  };
}

export function updateLocalOverlay(index: LocalSessionIndex, overlay: SessionUiOverlay): LocalSessionIndex {
  return { ...index, overlays: { ...index.overlays, [overlay.sessionId]: { ...index.overlays[overlay.sessionId], ...overlay } } };
}

export function removeLocalOverlay(index: LocalSessionIndex, sessionId: string): LocalSessionIndex {
  const overlays = { ...index.overlays };
  delete overlays[sessionId];
  return { ...index, overlays };
}

export function recordRecentWorkspace(index: LocalSessionIndex, cwd: string, max = 20): LocalSessionIndex {
  const normalized = normalizeCwd(cwd);
  if (!normalized) return index;
  return { ...index, recentWorkspaces: [normalized, ...index.recentWorkspaces.filter((item) => item !== normalized)].slice(0, max) };
}

export function applyLocalOverlays(sessions: SessionSummary[], index: LocalSessionIndex): Array<SessionSummary & Pick<SessionUiOverlay, "pinned" | "archived">> {
  return sessions.map((session) => ({ ...session, pinned: index.overlays[session.sessionId]?.pinned ?? false, archived: index.overlays[session.sessionId]?.archived ?? false }));
}

export function sessionCanPrompt(session: Pick<SessionSummary, "locked">): boolean {
  return session.locked !== true;
}

export function sessionCanDelete(session: Pick<SessionSummary, "locked">, capabilities: DevinCapabilities): boolean {
  return session.locked !== true && capabilities.session.delete === true;
}

export function normalizeCwd(value: string): string {
  const trimmed = value.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
  return trimmed.replaceAll("\\", "/");
}

function compareSession(a: SessionSummary, b: SessionSummary): number {
  return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0) || a.title.localeCompare(b.title);
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1_000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function dedupePaths(values: string[]): string[] { return [...new Set(values.map(normalizeCwd).filter(Boolean))]; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
