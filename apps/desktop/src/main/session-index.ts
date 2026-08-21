import fs from "node:fs/promises";
import path from "node:path";
import type { SessionSummary } from "../shared/types";

/**
 * Local UI overlay for Devin sessions.
 *
 * Devin remains the transcript and metadata source of truth. This file only
 * stores summaries received from the ACP host plus optional presentation flags;
 * it deliberately never stores message content.
 */
let indexFile: string | undefined;

export function configureSessionIndex(file: string): void {
  indexFile = file;
}

export async function listSessions(cwd?: string): Promise<SessionSummary[]> {
  const items = await readIndex();
  return items.filter((item) => !cwd || item.cwd === cwd).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertSessionSummary(summary: SessionSummary): Promise<SessionSummary[]> {
  const items = await readIndex();
  const existing = items.findIndex((item) => item.id === summary.id);
  const next = existing >= 0
    ? items.map((item, index) => index === existing ? mergeSessionSummary(item, summary) : item)
    : [summary, ...items];
  await writeIndex(next.slice(0, 500));
  return next;
}

/**
 * ACP session/list summaries do not always include local presentation fields
 * such as messageCount and may temporarily omit cwd while a new turn is
 * running. Those partial snapshots must never detach a task from its project
 * or replace the optimistic first-prompt title with stale server metadata.
 */
export function mergeSessionSummary(existing: SessionSummary, incoming: SessionSummary): SessionSummary {
  const incomingHasLocalConversationState = incoming.messageCount !== undefined;
  const existingHasLocalConversationState = (existing.messageCount ?? 0) > 0;
  const updatedAt = laterIsoDate(existing.updatedAt, incoming.updatedAt);
  return {
    ...existing,
    ...incoming,
    cwd: incoming.cwd.trim() || existing.cwd,
    title: existingHasLocalConversationState && !incomingHasLocalConversationState
      ? existing.title
      : incoming.title.trim() || existing.title,
    createdAt: earlierIsoDate(existing.createdAt, incoming.createdAt),
    updatedAt,
    ...(existing.messageCount !== undefined && incoming.messageCount === undefined
      ? { messageCount: existing.messageCount }
      : {}),
    ...(existing.preview !== undefined && incoming.preview === undefined
      ? { preview: existing.preview }
      : {}),
  };
}

function earlierIsoDate(first: string, second: string): string {
  return isoTimestamp(first) <= isoTimestamp(second) ? first : second;
}

function laterIsoDate(first: string, second: string): string {
  return isoTimestamp(first) >= isoTimestamp(second) ? first : second;
}

function isoTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function removeSessionSummary(id: string): Promise<SessionSummary[]> {
  const next = (await readIndex()).filter((item) => item.id !== id);
  await writeIndex(next);
  return next;
}

/** Compatibility helper for migration checks; it reads only summary lines. */
export async function readSessionSummary(file: string): Promise<SessionSummary | undefined> {
  try {
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
    let id = "";
    let cwd = "";
    let title = "";
    let model: string | undefined;
    let messageCount = 0;
    for (const line of lines) {
      let value: unknown;
      try { value = JSON.parse(line); } catch { continue; }
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      if (record.type === "session") {
        if (typeof record.id === "string") id = record.id;
        if (typeof record.cwd === "string") cwd = path.resolve(record.cwd);
      }
      if (record.type === "model_change" && typeof record.modelId === "string") model = record.modelId;
      if (record.type === "message" && record.message && typeof record.message === "object") {
        const role = (record.message as Record<string, unknown>).role;
        if (role === "user" || role === "assistant") {
          messageCount += 1;
          if (!title && role === "user") {
            const content = (record.message as Record<string, unknown>).content;
            if (Array.isArray(content)) {
              const text = content.find((part) => part && typeof part === "object" && (part as Record<string, unknown>).type === "text") as Record<string, unknown> | undefined;
              if (typeof text?.text === "string") title = text.text.slice(0, 80);
            }
          }
        }
      }
    }
    if (!id || !cwd) return undefined;
    const now = new Date().toISOString();
    return { id, path: file, storagePath: file, cwd, title: title || id, createdAt: now, updatedAt: now, ...(model ? { model } : {}), messageCount, pinned: false, archived: false };
  } catch {
    return undefined;
  }
}

export async function setSessionPinned(id: string, pinned: boolean): Promise<boolean> {
  const items = await readIndex();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return false;
  items[index] = { ...items[index], pinned };
  await writeIndex(items);
  return true;
}

export async function archiveSession(id: string): Promise<SessionSummary | undefined> {
  return updateOverlay(id, { archived: true });
}

export async function unarchiveSession(id: string): Promise<SessionSummary | undefined> {
  return updateOverlay(id, { archived: false });
}

async function updateOverlay(id: string, patch: Pick<SessionSummary, "archived">): Promise<SessionSummary | undefined> {
  const items = await readIndex();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return undefined;
  const updated = { ...items[index], ...patch };
  items[index] = updated;
  await writeIndex(items);
  return updated;
}

async function readIndex(): Promise<SessionSummary[]> {
  if (!indexFile) return [];
  try {
    const parsed = JSON.parse(await fs.readFile(indexFile, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSessionSummary) : [];
  } catch {
    return [];
  }
}

async function writeIndex(items: SessionSummary[]): Promise<void> {
  if (!indexFile) return;
  await fs.mkdir(path.dirname(indexFile), { recursive: true });
  await fs.writeFile(indexFile, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
}

function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SessionSummary>;
  return typeof item.id === "string"
    && typeof item.cwd === "string"
    && typeof item.title === "string"
    && typeof item.updatedAt === "string";
}
