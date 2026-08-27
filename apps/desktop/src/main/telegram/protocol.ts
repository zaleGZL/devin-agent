/*
 * Telegram Bot API client. Only the subset needed by the Devin Agent
 * desktop bridge is included. The desktop connects directly to
 * https://api.telegram.org over outbound HTTPS and does not use an
 * intermediary service.
 */
import crypto, { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

export const TELEGRAM_API_BASE = "https://api.telegram.org";
export const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";
export const TELEGRAM_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const LONG_POLL_TIMEOUT_SECONDS = 30;

export type TelegramChatAction = "typing" | "upload_photo" | "upload_document" | "find_location";

export interface TelegramFileMeta {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean; first_name?: string; last_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  document?: TelegramFileMeta;
  image?: TelegramFileMeta;
  animation?: TelegramFileMeta;
  video?: TelegramFileMeta;
  voice?: TelegramFileMeta;
  audio?: TelegramFileMeta;
  sticker?: TelegramFileMeta;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: unknown;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

function assertTelegramHttpsUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "api.telegram.org" || url.username || url.password) {
    throw new Error("Telegram 服务返回了不受信任的地址");
  }
  return url;
}

export class TelegramApi {
  private readonly baseUrl: string;
  private readonly fileBaseUrl: string;

  constructor(
    readonly token: string,
    _appVersion: string,
    apiBase = TELEGRAM_API_BASE,
    fileBase = TELEGRAM_FILE_BASE,
  ) {
    if (!/^\d+:AA[A-Za-z0-9_-]{30,}$/.test(token)) throw new Error("Telegram Bot Token 格式无效");
    this.baseUrl = `${assertTelegramHttpsUrl(apiBase).origin}/bot${token}`;
    this.fileBaseUrl = assertTelegramHttpsUrl(fileBase).origin;
  }

  async getMe(): Promise<{ id: number; username: string; first_name: string; can_join_groups: boolean }> {
    return this.request<{ id: number; username: string; first_name: string; can_join_groups: boolean }>("getMe", { timeoutMs: 15_000 });
  }

  async getUpdates(offset: number, signal?: AbortSignal): Promise<{ updates: TelegramUpdate[]; nextOffset: number }> {
    let updates: TelegramUpdate[];
    try {
      updates = await this.request<TelegramUpdate[]>("getUpdates", {
        method: "POST",
        body: {
          offset,
          timeout: LONG_POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message", "edited_message", "channel_post"],
        },
        timeoutMs: (LONG_POLL_TIMEOUT_SECONDS + 10) * 1000,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
        return { updates: [], nextOffset: offset };
      }
      throw error;
    }
    const nextOffset = updates.length > 0 ? updates[updates.length - 1].update_id + 1 : offset;
    return { updates, nextOffset };
  }

  async sendMessage(chatId: number, text: string, signal?: AbortSignal): Promise<TelegramMessage> {
    return this.request<TelegramMessage>("sendMessage", {
      method: "POST",
      body: { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
      timeoutMs: 15_000,
      signal,
    });
  }

  async sendChatAction(chatId: number, action: TelegramChatAction): Promise<void> {
    await this.request<boolean>("sendChatAction", {
      method: "POST",
      body: { chat_id: chatId, action },
      timeoutMs: 10_000,
    });
  }

  async sendPhoto(chatId: number, filePath: string, caption?: string): Promise<TelegramMessage> {
    return this.uploadMedia<TelegramMessage>("sendPhoto", chatId, "photo", filePath, caption);
  }

  async sendDocument(chatId: number, filePath: string, caption?: string): Promise<TelegramMessage> {
    return this.uploadMedia<TelegramMessage>("sendDocument", chatId, "document", filePath, caption);
  }

  async getFile(fileId: string): Promise<TelegramFileMeta & { file_path: string }> {
    const result = await this.request<TelegramFileMeta & { file_path: string }>("getFile", {
      method: "POST",
      body: { file_id: fileId },
      timeoutMs: 15_000,
    });
    if (!result.file_path) throw new Error("Telegram 没有返回文件路径");
    return result;
  }

  async downloadFile(filePath: string): Promise<{ buffer: Buffer; name: string }> {
    const url = `${this.fileBaseUrl}/bot${this.token}/${filePath}`;
    assertTelegramHttpsUrl(url);
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok) throw new Error(`Telegram 文件下载失败 (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > TELEGRAM_MEDIA_MAX_BYTES) throw new Error("Telegram 附件超过 50 MB");
    const name = path.basename(filePath) || `telegram-${Date.now()}`;
    return { buffer, name };
  }

  async downloadFileById(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string } | undefined> {
    const meta = await this.getFile(fileId).catch(() => undefined);
    if (!meta) return undefined;
    const downloaded = await this.downloadFile(meta.file_path).catch(() => undefined);
    if (!downloaded) return undefined;
    const mimeType = mimeFromName(downloaded.name);
    return { ...downloaded, mimeType };
  }

  private async uploadMedia<T>(
    endpoint: string,
    chatId: number,
    fieldName: string,
    filePath: string,
    caption?: string,
  ): Promise<T> {
    const real = await fs.realpath(filePath);
    const stat = await fs.stat(real);
    if (!stat.isFile()) throw new Error("只能发送文件");
    if (stat.size > TELEGRAM_MEDIA_MAX_BYTES) throw new Error("Telegram 附件不能超过 50 MB");
    const buffer = await fs.readFile(real);
    const fileName = path.basename(real);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(fieldName, new Blob([new Uint8Array(buffer)], { type: mimeFromName(fileName) }), fileName);
    if (caption) form.append("caption", caption);
    return this.request<T>(endpoint, { method: "POST", body: form, timeoutMs: 30_000 });
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      timeoutMs: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    assertTelegramHttpsUrl(url);
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const isForm = options.body instanceof FormData;
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: isForm ? {} : { "Content-Type": "application/json" },
      ...(options.body !== undefined && !isForm ? { body: JSON.stringify(options.body) } : {}),
      ...(isForm ? { body: options.body as FormData } : {}),
      signal,
      redirect: "error",
    });
    const text = await response.text();
    if (!response.ok) {
      let description = `Telegram 接口请求失败 (${response.status})`;
      try {
        const parsed = JSON.parse(text) as TelegramResponse<unknown>;
        if (parsed.description) description = `Telegram: ${parsed.description}`;
      } catch { /* ignore */ }
      throw new Error(description);
    }
    let parsed: TelegramResponse<T>;
    try {
      parsed = JSON.parse(text) as TelegramResponse<T>;
    } catch {
      throw new Error("Telegram 接口返回了无效数据");
    }
    if (!parsed.ok) throw new Error(`Telegram: ${parsed.description ?? "未知错误"}`);
    return parsed.result as T;
  }
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export function isImageFile(filePath: string): boolean {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

export function redactToken(token: string): string {
  return token.length > 10 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "[redacted]";
}

function mimeFromName(name: string): string {
  const extension = path.extname(name).toLowerCase();
  const values: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
  };
  return values[extension] ?? "application/octet-stream";
}

export function mediaKind(mimeType: string): "image" | "voice" | "file" | "video" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "voice";
  return "file";
}

export function generateClientId(): string {
  return `devin-agent-tg-${randomUUID()}`;
}

export function encryptAesKey(): Buffer {
  return crypto.randomBytes(16);
}
