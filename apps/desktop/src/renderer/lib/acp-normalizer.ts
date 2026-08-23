import type {
  AgentEvent,
  AvailableCommand,
  ChatImage,
  ConfigOptionState,
  PlanState,
  PlanStep,
  RawDiagnostic,
  SessionUpdateEnvelope,
  ToolStatus,
  UsageState,
} from "../../shared/conversation";
import type { MentionRef } from "../../shared/mentions";

type JsonRecord = Record<string, unknown>;

const MAX_DIAGNOSTIC_STRING = 4_000;
const MAX_DIAGNOSTIC_DEPTH = 6;
const SENSITIVE_KEY = /(token|secret|password|passwd|credential|authorization|api[-_]?key|cookie|private[-_]?key|access[-_]?key|refresh[-_]?token|env)/i;

/**
 * Convert a Devin/ACP session update into the small internal event vocabulary
 * consumed by the conversation reducer.  The function is intentionally
 * tolerant of extra fields and ACP extension envelopes: a new update never
 * interrupts an existing stream merely because this version cannot render it.
 */
export function normalizeAcpUpdate(
  input: SessionUpdateEnvelope | unknown,
  fallbackSessionId = "unknown-session",
): AgentEvent {
  const envelope = isRecord(input) && "update" in input
    ? input as unknown as SessionUpdateEnvelope
    : { sessionId: fallbackSessionId, update: input };
  const sessionId = typeof envelope.sessionId === "string" && envelope.sessionId ? envelope.sessionId : fallbackSessionId;
  const updateId = typeof envelope.updateId === "string" ? envelope.updateId : undefined;
  const timestamp = normalizeTimestamp(envelope.timestamp) ?? Date.now();
  const update = isRecord(envelope.update) ? envelope.update : {};
  const kind = updateKind(update);
  const chain = extractChain(input, update);
  if (chain === "invalid") {
    return unknownEvent(sessionId, updateId, timestamp, kind || "unknown", input, "无法识别的 cognition.ai/chain 元数据");
  }
  const chainField = chain === "side" ? { chainId: "side" } : {};

  switch (kind) {
    case "user_message_chunk":
    case "agent_message_chunk": {
      const role = kind === "user_message_chunk" ? "user" : "assistant";
      const content = contentValue(update.content ?? update.message);
      const text = extractText(content);
      const images = extractImages(content);
      const mentions = extractMentions(content);
      if (!text && images.length === 0 && mentions.length === 0) return unknownEvent(sessionId, updateId, timestamp, kind, update, "消息 chunk 不包含可显示内容");
      return {
        type: "message_chunk",
        ...chainField,
        sessionId,
        role,
        text,
        ...(typeof update.messageId === "string" ? { messageId: update.messageId } : {}),
        ...(images.length > 0 ? { images } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(phase(update) ? { phase: phase(update) } : {}),
        timestamp,
      };
    }
    case "agent_thought_chunk": {
      const text = extractText(contentValue(update.content ?? update.thought ?? update.text));
      if (!text) return unknownEvent(sessionId, updateId, timestamp, kind, update, "thought chunk 不包含文本");
      return {
        type: "thought_chunk",
        ...chainField,
        sessionId,
        text,
        ...(typeof update.messageId === "string" ? { messageId: update.messageId } : {}),
        ...(phase(update) ? { phase: phase(update) } : {}),
        timestamp,
      };
    }
    case "tool_call": {
      const toolId = stringValue(update.toolCallId ?? update.id);
      if (!toolId) return unknownEvent(sessionId, updateId, timestamp, kind, update, "tool_call 缺少 toolCallId");
      const name = stringValue(update.name ?? update.kind) || "tool";
      const status = normalizeToolStatus(update.status);
      if (status === "complete" || status === "error" || status === "cancelled") {
        return {
          type: "tool_end",
          ...chainField,
          sessionId,
          toolId,
          name,
          ...(stringValue(update.title) ? { title: stringValue(update.title) } : {}),
          ...(stringifyContent(update.rawOutput ?? update.output ?? update.content) ? { output: stringifyContent(update.rawOutput ?? update.output ?? update.content) } : {}),
          ...(status === "error" ? { isError: true, error: stringifyContent(update.error) } : {}),
          status,
          timestamp,
        };
      }
      return {
        type: "tool_start",
        ...chainField,
        sessionId,
        toolId,
        name,
        ...(stringValue(update.title) ? { title: stringValue(update.title) } : {}),
        ...(has(update, "rawInput") ? { args: update.rawInput } : has(update, "arguments") ? { args: update.arguments } : {}),
        timestamp,
      };
    }
    case "tool_call_update": {
      const toolId = stringValue(update.toolCallId ?? update.id);
      if (!toolId) return unknownEvent(sessionId, updateId, timestamp, kind, update, "tool_call_update 缺少 toolCallId");
      const status = normalizeToolStatus(update.status);
      const output = stringifyContent(update.rawOutput ?? update.output ?? update.content);
      return {
        type: status === "complete" || status === "error" || status === "cancelled" ? "tool_end" : "tool_update",
        ...chainField,
        sessionId,
        toolId,
        ...(stringValue(update.name) ? { name: stringValue(update.name) } : {}),
        ...(stringValue(update.title) ? { title: stringValue(update.title) } : {}),
        ...(output ? { output } : {}),
        ...(has(update, "rawInput") ? { args: update.rawInput } : {}),
        ...(status === "error" ? { isError: true, error: stringifyContent(update.error) } : {}),
        ...(status ? { status } : {}),
        timestamp,
      } as AgentEvent;
    }
    case "plan": {
      const plan = normalizePlan(update);
      if (!plan) return unknownEvent(sessionId, updateId, timestamp, kind, update, "plan 不包含有效 steps/entries");
      return { type: "plan", ...chainField, sessionId, plan: { ...plan, updatedAt: timestamp }, timestamp };
    }
    case "available_commands_update": {
      const commands = normalizeCommands(update.availableCommands ?? update.commands);
      return { type: "commands", ...chainField, sessionId, commands, timestamp };
    }
    case "current_mode_update": {
      const modeId = stringValue(update.currentModeId ?? update.modeId ?? update.currentMode);
      if (!modeId) return unknownEvent(sessionId, updateId, timestamp, kind, update, "current_mode_update 缺少 mode id");
      return { type: "mode", ...chainField, sessionId, modeId, timestamp };
    }
    case "config_option_update": {
      // ACP v1 sends the complete collection under `configOptions`. Keep the
      // legacy single-option envelope as a compatibility fallback only.
      if (has(update, "configOptions")) {
        if (!Array.isArray(update.configOptions)) {
          return unknownEvent(sessionId, updateId, timestamp, kind, update, "config_option_update 的 configOptions 不是数组");
        }
        const options = update.configOptions.flatMap<ConfigOptionState>((value) => {
          if (!isRecord(value)) return [];
          const option = normalizeConfigOption(value);
          return option ? [option] : [];
        });
        return { type: "config_options", ...chainField, sessionId, options, timestamp };
      }
      const option = normalizeConfigOption(update);
      if (!option) return unknownEvent(sessionId, updateId, timestamp, kind, update, "config_option_update 缺少 config id");
      return { type: "config", ...chainField, sessionId, option, timestamp };
    }
    case "session_info_update": {
      return {
        type: "session_info",
        ...chainField,
        sessionId,
        ...(stringValue(update.title) ? { title: stringValue(update.title) } : {}),
        ...(normalizeTimestamp(update.updatedAt) !== undefined ? { updatedAt: normalizeTimestamp(update.updatedAt) } : {}),
        ...(stringValue(update.cwd) ? { cwd: stringValue(update.cwd) } : {}),
        ...(typeof update.isLocked === "boolean" ? { locked: update.isLocked } : typeof update.locked === "boolean" ? { locked: update.locked } : {}),
        timestamp,
      };
    }
    case "usage_update": {
      return { type: "usage", ...chainField, sessionId, usage: normalizeUsage(update), timestamp };
    }
    default:
      return { ...unknownEvent(sessionId, updateId, timestamp, kind || "unknown", update, "未识别的 ACP session update"), ...chainField };
  }
}

export function normalizeAcpUpdates(
  updates: Iterable<SessionUpdateEnvelope | unknown>,
  fallbackSessionId = "unknown-session",
): AgentEvent[] {
  return Array.from(updates, (update) => normalizeAcpUpdate(update, fallbackSessionId));
}

export function toRawDiagnostic(event: Extract<AgentEvent, { type: "unknown" }>): RawDiagnostic {
  return {
    sessionId: event.sessionId,
    ...(event.updateId ? { updateId: event.updateId } : {}),
    timestamp: event.timestamp,
    kind: event.kind,
    raw: event.raw,
    redacted: true,
    diagnostic: event.diagnostic,
  };
}

/** Redact credential-like values before writing unknown ACP payloads to logs/state. */
export function redactDiagnostic(value: unknown): unknown {
  return redact(value, 0);
}

function unknownEvent(sessionId: string, updateId: string | undefined, timestamp: number, kind: string, raw: unknown, diagnostic: string): AgentEvent {
  return {
    type: "unknown",
    sessionId,
    ...(updateId ? { updateId } : {}),
    timestamp,
    kind,
    raw: redactDiagnostic(raw),
    diagnostic,
  };
}

function updateKind(update: JsonRecord): string {
  return stringValue(update.sessionUpdate ?? update.type ?? update.kind ?? update.event);
}

function extractChain(input: unknown, update: JsonRecord): "main" | "side" | "invalid" | undefined {
  const root = isRecord(input) ? input : {};
  const params = isRecord(root.params) ? root.params : {};
  const candidates = [
    recordValue(params._meta)?.["cognition.ai/chain"],
    recordValue(root._meta)?.["cognition.ai/chain"],
    recordValue(root.meta)?.["cognition.ai/chain"],
    recordValue(update._meta)?.["cognition.ai/chain"],
  ];
  const marker = candidates.find((value) => value !== undefined);
  if (marker === undefined) return undefined;
  return marker === "main" || marker === "side" ? marker : "invalid";
}

function recordValue(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function contentValue(value: unknown): unknown {
  if (isRecord(value) && value.type === "content" && "content" in value) return value.content;
  return value;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.text === "string") return value.text;
  if (Array.isArray(value)) {
    return value
      .filter(isRecord)
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => String(part.text))
      .join("");
  }
  return "";
}

function extractImages(value: unknown): ChatImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ChatImage>((part) => {
    if (!isRecord(part) || part.type !== "image") return [];
    const data = stringValue(part.data ?? part.source);
    const mimeType = stringValue(part.mimeType ?? part.mediaType);
    if (!data || !mimeType.startsWith("image/")) return [];
    return [{ data, mimeType, ...(stringValue(part.uri) ? { uri: stringValue(part.uri) } : {}) }];
  });
}

function extractMentions(value: unknown): MentionRef[] {
  const parts = Array.isArray(value) ? value : [value];
  return parts.flatMap<MentionRef>((part, index) => {
    if (!isRecord(part)) return [];
    if (part.type === "resource_link" && typeof part.uri === "string") {
      const rawName = typeof part.name === "string" ? part.name : resourceBasename(part.uri);
      const directory = rawName.endsWith("/");
      const mentionPath = rawName.replace(/^@/, "").replace(/\/$/, "");
      if (!mentionPath) return [];
      return directory
        ? [{ id: `chunk-directory-${index}-${mentionPath}`, kind: "directory", path: mentionPath, label: mentionPath }]
        : [{
            id: `chunk-file-${index}-${mentionPath}`,
            kind: "file",
            path: mentionPath,
            label: mentionPath,
            ...(typeof part.size === "number" ? { size: part.size } : {}),
            ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}),
          }];
    }
    if (part.type === "resource" && isRecord(part.resource) && typeof part.resource.uri === "string") {
      const mentionPath = resourceBasename(part.resource.uri);
      if (!mentionPath) return [];
      return [{
        id: `chunk-file-${index}-${mentionPath}`,
        kind: "file",
        path: mentionPath,
        label: mentionPath,
        ...(typeof part.resource.mimeType === "string" ? { mimeType: part.resource.mimeType } : {}),
      }];
    }
    return [];
  });
}

function resourceBasename(uri: string): string {
  try {
    const pathname = decodeURIComponent(new URL(uri).pathname).replace(/\/$/, "");
    return pathname.slice(pathname.lastIndexOf("/") + 1);
  } catch {
    const value = uri.replace(/\/$/, "");
    return value.slice(value.lastIndexOf("/") + 1);
  }
}

function phase(update: JsonRecord): "start" | "update" | "end" | undefined {
  const value = stringValue(update.phase ?? update.status);
  if (value === "start" || value === "started") return "start";
  if (value === "end" || value === "ended" || value === "complete" || value === "completed") return "end";
  if (value === "update" || value === "streaming") return "update";
  return undefined;
}

function normalizePlan(update: JsonRecord): Omit<PlanState, "updatedAt"> | undefined {
  const source = Array.isArray(update.entries) ? update.entries : Array.isArray(update.plan) ? update.plan : Array.isArray(update.steps) ? update.steps : undefined;
  if (!source || source.length === 0) return undefined;
  const steps: PlanStep[] = [];
  for (const item of source) {
    if (!isRecord(item)) return undefined;
    const step = stringValue(item.step ?? item.content ?? item.title ?? item.description).trim();
    const status = normalizePlanStatus(item.status);
    if (!step || !status) return undefined;
    const priority = typeof item.priority === "number" && Number.isFinite(item.priority) ? item.priority : undefined;
    steps.push({ step, status, ...(priority !== undefined ? { priority } : {}) });
  }
  const explanation = stringValue(update.explanation ?? update.description).trim();
  return { ...(explanation ? { explanation } : {}), steps };
}

function normalizeCommands(value: unknown): AvailableCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<AvailableCommand>((entry) => {
    if (typeof entry === "string") return entry.trim() ? [{ name: entry.trim() }] : [];
    if (!isRecord(entry)) return [];
    const name = stringValue(entry.name ?? entry.command).trim();
    const meta = isRecord(entry._meta) ? entry._meta : undefined;
    const category = stringValue(entry.category ?? meta?.["cognition.ai/category"]).trim();
    return name ? [{
      name,
      ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}),
      ...(has(entry, "input") ? { input: entry.input } : {}),
      ...(category ? { category } : {}),
      raw: entry,
    }] : [];
  });
}

function normalizeConfigOption(value: JsonRecord): ConfigOptionState | undefined {
  const id = stringValue(value.configId ?? value.id).trim();
  if (!id) return undefined;
  const source = Array.isArray(value.options) ? value.options : [];
  const options = source.flatMap<NonNullable<ConfigOptionState["options"]>[number]>((entry) => {
    if (typeof entry === "string") return [{ value: entry }];
    if (!isRecord(entry)) return [];
    const optionValue = stringValue(entry.value ?? entry.id).trim();
    const meta = isRecord(entry._meta) ? entry._meta : {};
    const supportsImages = typeof entry.supportsImages === "boolean" ? entry.supportsImages : typeof meta["cognition.ai/supportsImages"] === "boolean" ? meta["cognition.ai/supportsImages"] : undefined;
    return optionValue ? [{ value: optionValue, ...(stringValue(entry.name ?? entry.label) ? { name: stringValue(entry.name ?? entry.label) } : {}), ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}), ...(supportsImages !== undefined ? { supportsImages } : {}), ...(typeof entry.supportsAudio === "boolean" ? { supportsAudio: entry.supportsAudio } : {}), ...(typeof entry.contextWindow === "number" ? { contextWindow: entry.contextWindow } : {}), raw: entry }] : [];
  });
  const currentValue = value.currentValue ?? value.value;
  return {
    id,
    ...(stringValue(value.name ?? value.label) ? { name: stringValue(value.name ?? value.label) } : {}),
    ...(stringValue(value.description) ? { description: stringValue(value.description) } : {}),
    ...(stringValue(value.category) ? { category: stringValue(value.category) } : {}),
    ...(stringValue(value.type) ? { type: stringValue(value.type) } : {}),
    ...(typeof currentValue === "string" || typeof currentValue === "boolean" || typeof currentValue === "number" ? { currentValue } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

function normalizeUsage(value: JsonRecord): UsageState {
  const inputTokens = finiteNumber(value.inputTokens ?? value.input ?? value.input_tokens);
  const outputTokens = finiteNumber(value.outputTokens ?? value.output ?? value.output_tokens);
  const totalTokens = finiteNumber(value.totalTokens ?? value.total ?? value.total_tokens);
  const contextTokens = finiteNumber(value.contextTokens ?? value.context ?? value.used);
  const contextWindow = finiteNumber(value.contextWindow ?? value.context_window ?? value.size);
  const cost = finiteNumber(value.cost ?? value.costUsd ?? value.cost_usd);
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(cost !== undefined ? { cost } : {}),
    raw: redactDiagnostic(value),
  };
}

function normalizeToolStatus(value: unknown): ToolStatus | undefined {
  const status = stringValue(value).toLowerCase();
  if (status === "pending") return "pending";
  if (status === "running" || status === "in_progress" || status === "in-progress") return "running";
  if (status === "complete" || status === "completed" || status === "success") return "complete";
  if (status === "error" || status === "failed" || status === "failure") return "error";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return undefined;
}

function normalizePlanStatus(value: unknown): PlanStep["status"] | undefined {
  const status = stringValue(value).toLowerCase();
  if (status === "pending" || status === "not_started" || status === "not-started") return "pending";
  if (status === "in_progress" || status === "in-progress" || status === "running") return "in_progress";
  if (status === "completed" || status === "complete" || status === "done") return "completed";
  return undefined;
}

function stringifyContent(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = extractText(value);
  if (text) return crop(text, 12_000);
  if (typeof value === "string") return crop(value, 12_000);
  try {
    return crop(JSON.stringify(redactDiagnostic(value), null, 2), 12_000);
  } catch {
    return crop(String(value), 12_000);
  }
}

function redact(value: unknown, depth: number): unknown {
  if (depth > MAX_DIAGNOSTIC_DEPTH) return "[truncated]";
  if (typeof value === "string") return crop(value, MAX_DIAGNOSTIC_STRING);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (isRecord(value)) {
    const result: JsonRecord = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1_000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function has(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function crop(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
