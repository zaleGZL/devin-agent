import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import type { TelegramMedia, TelegramMessage } from "../../shared/types";

const require = createRequire(import.meta.url);

export interface StoredTelegramBotState {
  workspacePath?: string;
  sessionId?: string;
  botId?: number;
  chatId?: number;
  updatesOffset: number;
  autoLaunch: boolean;
  lastError?: string;
  paused: boolean;
}

export type TelegramOutboxPayload =
  | { kind: "text"; chatId: number; text: string }
  | { kind: "media"; chatId: number; localPath: string; caption?: string };

interface StateRow {
  workspace_path: string | null;
  session_id: string | null;
  bot_id: number | null;
  chat_id: number | null;
  updates_offset: number;
  auto_launch: number;
  last_error: string | null;
  paused: number;
}

interface MessageRow {
  id: number;
  platform_id: string | null;
  direction: TelegramMessage["direction"];
  source: TelegramMessage["source"];
  role: TelegramMessage["role"];
  text: string;
  media_json: string;
  status: TelegramMessage["status"];
  created_at: number;
}

export class TelegramStore {
  private readonly db: DatabaseSync;
  readonly rootPath: string;
  readonly mediaPath: string;
  readonly secretsPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.mediaPath = path.join(rootPath, "media");
    this.secretsPath = path.join(rootPath, "credentials.json");
    fsSync.mkdirSync(this.mediaPath, { recursive: true, mode: 0o700 });
    const { DatabaseSync: SQLiteDatabase } = require("node:sqlite") as typeof import("node:sqlite");
    const databasePath = path.join(rootPath, "state.sqlite");
    this.db = new SQLiteDatabase(databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_bot_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), workspace_path TEXT, session_id TEXT,
        bot_id INTEGER, chat_id INTEGER, updates_offset INTEGER NOT NULL DEFAULT 0,
        auto_launch INTEGER NOT NULL DEFAULT 0, last_error TEXT, paused INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO telegram_bot_state (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS telegram_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id TEXT UNIQUE, direction TEXT NOT NULL,
        source TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', media_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS telegram_messages_created_idx ON telegram_messages(id DESC);
      CREATE TABLE IF NOT EXISTS telegram_inbox (
        platform_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS telegram_outbox (
        client_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    fsSync.chmodSync(databasePath, 0o600);
  }

  close(): void {
    this.db.close();
  }

  getState(): StoredTelegramBotState {
    const row = this.db.prepare("SELECT * FROM telegram_bot_state WHERE id=1").get() as unknown as StateRow;
    return {
      ...(row.workspace_path ? { workspacePath: row.workspace_path } : {}),
      ...(row.session_id ? { sessionId: row.session_id } : {}),
      ...(row.bot_id != null ? { botId: row.bot_id } : {}),
      ...(row.chat_id != null ? { chatId: row.chat_id } : {}),
      updatesOffset: row.updates_offset,
      autoLaunch: Boolean(row.auto_launch),
      ...(row.last_error ? { lastError: row.last_error } : {}),
      paused: Boolean(row.paused),
    };
  }

  patchState(patch: Partial<StoredTelegramBotState>): StoredTelegramBotState {
    const current = { ...this.getState(), ...patch };
    this.db.prepare(`UPDATE telegram_bot_state SET workspace_path=?,session_id=?,bot_id=?,chat_id=?,
      updates_offset=?,auto_launch=?,last_error=?,paused=? WHERE id=1`).run(
      current.workspacePath ?? null,
      current.sessionId ?? null,
      current.botId ?? null,
      current.chatId ?? null,
      current.updatesOffset,
      current.autoLaunch ? 1 : 0,
      current.lastError ?? null,
      current.paused ? 1 : 0,
    );
    return current;
  }

  addMessage(input: Omit<TelegramMessage, "id" | "createdAt"> & { createdAt?: number }): TelegramMessage {
    const createdAt = input.createdAt ?? Date.now();
    const result = this.db.prepare(`INSERT INTO telegram_messages(platform_id,direction,source,role,text,media_json,status,created_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(platform_id) DO NOTHING`).run(
      input.platformId ?? null,
      input.direction,
      input.source,
      input.role,
      input.text,
      JSON.stringify(input.media),
      input.status,
      createdAt,
    );
    if (result.changes === 0 && input.platformId) {
      const existing = this.db.prepare("SELECT * FROM telegram_messages WHERE platform_id=?").get(input.platformId) as unknown as MessageRow;
      return rowToMessage(existing);
    }
    const row = this.db.prepare("SELECT * FROM telegram_messages WHERE id=last_insert_rowid()").get() as unknown as MessageRow;
    return rowToMessage(row);
  }

  updateMessage(id: number, status: TelegramMessage["status"], text?: string): TelegramMessage | undefined {
    if (text === undefined) this.db.prepare("UPDATE telegram_messages SET status=? WHERE id=?").run(status, id);
    else this.db.prepare("UPDATE telegram_messages SET status=?,text=? WHERE id=?").run(status, text, id);
    const row = this.db.prepare("SELECT * FROM telegram_messages WHERE id=?").get(id) as unknown as MessageRow | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  updateMessageByPlatformId(platformId: string, status: TelegramMessage["status"]): TelegramMessage | undefined {
    this.db.prepare("UPDATE telegram_messages SET status=? WHERE platform_id=?").run(status, platformId);
    const row = this.db.prepare("SELECT * FROM telegram_messages WHERE platform_id=?").get(platformId) as unknown as MessageRow | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  history(before?: number, limit = 100): { messages: TelegramMessage[]; hasMore: boolean; before?: number } {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const rows = (before
      ? this.db.prepare("SELECT * FROM telegram_messages WHERE id < ? ORDER BY id DESC LIMIT ?").all(before, safeLimit + 1)
      : this.db.prepare("SELECT * FROM telegram_messages ORDER BY id DESC LIMIT ?").all(safeLimit + 1)) as unknown as MessageRow[];
    const hasMore = rows.length > safeLimit;
    const page = rows.slice(0, safeLimit).reverse().map(rowToMessage);
    return { messages: page, hasMore, ...(hasMore && page[0] ? { before: page[0].id } : {}) };
  }

  persistInbox(platformId: string, payload: unknown): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO telegram_inbox(platform_id,payload_json,status,created_at) VALUES(?,?,'pending',?)")
      .run(platformId, JSON.stringify(payload), Date.now()).changes > 0;
  }

  completeInbox(platformId: string): void {
    this.db.prepare("UPDATE telegram_inbox SET status='complete' WHERE platform_id=?").run(platformId);
  }

  pendingInbox(): Array<{ platformId: string; payload: unknown }> {
    const rows = this.db.prepare("SELECT platform_id,payload_json FROM telegram_inbox WHERE status='pending' ORDER BY created_at").all() as Array<{ platform_id: string; payload_json: string }>;
    return rows.map((row) => ({ platformId: row.platform_id, payload: JSON.parse(row.payload_json) as unknown }));
  }

  enqueueOutbox(clientId: string, payload: TelegramOutboxPayload): void {
    this.db.prepare("INSERT OR IGNORE INTO telegram_outbox(client_id,payload_json,status,created_at) VALUES(?,?,'pending',?)")
      .run(clientId, JSON.stringify(payload), Date.now());
  }

  completeOutbox(clientId: string): void {
    this.db.prepare("UPDATE telegram_outbox SET status='sent' WHERE client_id=?").run(clientId);
  }

  failOutbox(clientId: string, error: string): void {
    this.db.prepare("UPDATE telegram_outbox SET status='failed',attempts=attempts+1,last_error=? WHERE client_id=?")
      .run(error.slice(0, 500), clientId);
  }

  pendingOutbox(): Array<{ clientId: string; payload: TelegramOutboxPayload }> {
    const rows = this.db.prepare("SELECT client_id,payload_json FROM telegram_outbox WHERE status!='sent' AND attempts < 5 ORDER BY created_at").all() as Array<{ client_id: string; payload_json: string }>;
    return rows.map((row) => ({ clientId: row.client_id, payload: JSON.parse(row.payload_json) as TelegramOutboxPayload }));
  }

  async saveMedia(buffer: Buffer, name: string, direction: "inbound" | "outbound"): Promise<string> {
    if (buffer.length > 50 * 1024 * 1024) throw new Error("Telegram 附件不能超过 50 MB");
    const directory = path.join(this.mediaPath, direction, new Date().toISOString().slice(0, 10));
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const safeName = safeFileName(name);
    const filePath = path.join(directory, `${Date.now()}-${safeName}`);
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    return filePath;
  }

  mediaBytes(): number {
    return directoryBytes(this.mediaPath);
  }

  async clearAll(): Promise<void> {
    this.db.exec("DELETE FROM telegram_messages; DELETE FROM telegram_inbox; DELETE FROM telegram_outbox; DELETE FROM telegram_bot_state; INSERT INTO telegram_bot_state(id) VALUES(1)");
    await fs.rm(this.mediaPath, { recursive: true, force: true });
    await fs.mkdir(this.mediaPath, { recursive: true, mode: 0o700 });
  }
}

export function safeFileName(name: string): string {
  return path.basename(name).replace(/[^\p{L}\p{N}_.-]/gu, "_").slice(-120) || "file.bin";
}

function rowToMessage(row: MessageRow): TelegramMessage {
  let media: TelegramMedia[] = [];
  try {
    media = JSON.parse(row.media_json) as TelegramMedia[];
  } catch {
    media = [];
  }
  return {
    id: row.id,
    ...(row.platform_id ? { platformId: row.platform_id } : {}),
    direction: row.direction,
    source: row.source,
    role: row.role,
    text: row.text,
    media,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function directoryBytes(directory: string): number {
  let total = 0;
  try {
    for (const entry of fsSync.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) total += directoryBytes(candidate);
      else if (entry.isFile()) total += fsSync.statSync(candidate).size;
    }
  } catch {
    return total;
  }
  return total;
}
