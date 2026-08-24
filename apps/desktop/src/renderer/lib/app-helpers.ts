import type { DesktopInteractionRequest, SessionSummary } from "../../shared/types";
import type { ChatImage, ChatMessage, ToolActivity } from "./conversation";
import { compareSidebarSessions } from "./sidebar-order";
import type { Attachment } from "../features/app/types";
import { useI18n } from "./i18n";

export const DEVIN_GITHUB_URL = "https://github.com/zaleGZL/devin-agent";
export const DEVIN_GITHUB_DISPLAY_URL = "github.com/zaleGZL/devin-agent";
export const DEVIN_ISSUES_URL = DEVIN_GITHUB_URL + "/issues";
export const DEVIN_ISSUES_DISPLAY_URL = DEVIN_GITHUB_DISPLAY_URL + "/issues";

export function profileInitials(nickname: string): string {
  const value = nickname.trim();
  if (!value) return "U";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const source = await readFileDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("Unable to read avatar image"));
    next.src = source;
  });
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) throw new Error("Avatar image is empty");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process avatar image");
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);
  return canvas.toDataURL("image/webp", 0.86);
}

export function readFileDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl = await readFileDataUrl(file);
  return { name: file.name, mimeType: file.type, data: dataUrl.split(",")[1] ?? "" };
}

export function imageDataUrl(image: ChatImage): string {
  return image.data.startsWith("data:") ? image.data : `data:${image.mimeType};base64,${image.data}`;
}

export type Translator = ReturnType<typeof useI18n>["t"];

export function shortModel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 20)}…` : value;
}

export function workDuration(messages: ChatMessage[], liveNow?: number): number | undefined {
  const tools = messages.flatMap((message) => message.tools);
  const starts = tools
    .map((tool) => tool.startedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  for (const message of messages) {
    const messageStart = normalizeTimestamp(message.timestamp);
    if (messageStart !== undefined) starts.push(messageStart);
  }
  if (starts.length === 0) return undefined;

  const ends = tools
    .map((tool) => tool.endedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const end = liveNow ?? (ends.length > 0 ? Math.max(...ends) : undefined);
  if (end === undefined) return undefined;
  return Math.max(0, end - Math.min(...starts));
}

export function normalizeTimestamp(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value < 10_000_000_000 ? value * 1_000 : value;
}

export function clampPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

export function formatCompactTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1_000) return Math.round(value).toLocaleString();
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  return `${Math.round(value / 1_000_000)}m`;
}

export function formatCost(value: number): string {
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`;
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(1, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function relativeTime(value: string, locale: string, nowLabel: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return nowLabel;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function sortSidebarSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort(compareSidebarSessions);
}

export function formatJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function formatToolArgs(tool: ToolActivity): string {
  if (typeof tool.args === "string") return tool.args;
  if (!tool.args || typeof tool.args !== "object" || Array.isArray(tool.args)) return formatJson(tool.args);

  const args = tool.args as Record<string, unknown>;
  const commandKey = typeof args.cmd === "string" ? "cmd" : typeof args.command === "string" ? "command" : undefined;
  if (commandKey) {
    const command = String(args[commandKey]);
    const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== commandKey));
    return Object.keys(rest).length > 0 ? `${command}\n\n${formatJson(rest)}` : command;
  }

  const entries = Object.entries(args);
  if (entries.length === 1 && typeof entries[0]?.[1] === "string") return entries[0][1];
  return formatJson(tool.args);
}

export function toolDisplayTitle(tool: ToolActivity, t: Translator): string {
  const name = tool.name.toLowerCase();
  const args = tool.args && typeof tool.args === "object" && !Array.isArray(tool.args)
    ? tool.args as Record<string, unknown>
    : {};
  const fileValue = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : undefined;
  const file = fileValue ? crop(fileValue, 76) : undefined;

  if (name.includes("exec") || name.includes("bash") || name.includes("command")) return t("work.toolRanCommand");
  if (name.includes("read")) return file ? t("work.toolRead", { file }) : t("work.toolReadFiles");
  if (name.includes("write")) return file ? t("work.toolWrote", { file }) : t("work.toolWroteFile");
  if (name.includes("edit") || name.includes("patch")) return file ? t("work.toolEdited", { file }) : t("work.toolEditedFiles");
  if (name.includes("search")) return t("work.toolSearched");
  if (name === "update_plan") return t("work.toolUpdatedPlan");
  return tool.name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function toolFilePath(tool: ToolActivity): string | undefined {
  const name = tool.name.toLowerCase();
  if (!["read", "write", "edit", "patch", "file", "image"].some((part) => name.includes(part))) return undefined;
  if (!tool.args || typeof tool.args !== "object" || Array.isArray(tool.args)) return undefined;
  const args = tool.args as Record<string, unknown>;
  for (const key of ["path", "file_path", "filePath", "filename", "target", "targetPath"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function previewPathFromHref(href?: string): string | undefined {
  if (!href || /^(?:https?:|mailto:|#)/i.test(href)) return undefined;
  if (href.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(href).pathname);
    } catch {
      return undefined;
    }
  }
  if (/^(?:\/|\.\.?\/|~\/)/.test(href)) return decodeURIComponent(href);
  return undefined;
}

export function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function crop(value: string, length: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > length ? `${singleLine.slice(0, length - 1)}…` : singleLine;
}

export function cleanError(value: string): string {
  return value.replace(/^Error invoking remote method '[^']+':\s*/i, "").split("\n").filter(Boolean).slice(0, 3).join(" ");
}

export function localizeInteractionError(value: string, locale: string): string {
  if (locale !== "en") return value;
  if (value === "此字段为必填项") return "This field is required.";
  if (value === "值类型不符合字段要求") return "The value has the wrong type.";
  if (value === "输入格式不符合要求") return "The value does not match the required format.";
  if (value === "选择值不在允许范围内") return "Choose only an allowed value.";
  return value
    .replace(/^至少输入 (\d+) 个字符$/, "Enter at least $1 characters.")
    .replace(/^最多输入 (\d+) 个字符$/, "Enter no more than $1 characters.")
    .replace(/^值不能小于 (.+)$/, "The value must be at least $1.")
    .replace(/^值不能大于 (.+)$/, "The value must be no more than $1.")
    .replace(/^至少选择 (\d+) 项$/, "Choose at least $1 items.")
    .replace(/^最多选择 (\d+) 项$/, "Choose no more than $1 items.");
}

export function isDesktopInteractionRequest(value: unknown): value is DesktopInteractionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return typeof request.id === "string"
    && Number.isSafeInteger(request.generation)
    && (request.kind === "permission" || request.kind === "elicitation-form" || request.kind === "elicitation-url");
}

export function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return typeof session.id === "string"
    && typeof session.cwd === "string"
    && typeof session.title === "string"
    && typeof session.updatedAt === "string";
}
