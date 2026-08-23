import type {
  AgentEvent,
  AssistantActivity,
  ChatAnnotation,
  ChatImage,
  ChatMessage,
  ConversationGroup,
  ConversationState,
  RawDiagnostic,
  ToolActivity,
  ToolStatus,
  TurnResponseEntry,
  TurnWorkEntry,
  WorkItem,
} from "../../shared/conversation";
import { toRawDiagnostic } from "./acp-normalizer";
import { parsePromptAnnotations } from "./annotations";
import type { MentionRef } from "../../shared/mentions";
import { isPositionedMention } from "./mentions";

type JsonRecord = Record<string, unknown>;

export type { AssistantActivity, ChatAnnotation, ChatImage, ChatMessage, ConversationGroup, ToolActivity, TurnResponseEntry, TurnWorkEntry, WorkItem };

export function createConversationState(sessionId: string, messages: ChatMessage[] = []): ConversationState {
  return {
    sessionId,
    messages,
    commands: [],
    configOptions: {},
    unknownEvents: [],
  };
}

export function normalizeMessages(messages: unknown[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const value of messages) {
    if (!isRecord(value)) continue;
    const role = value.role;
    if (role === "toolResult" || role === "tool_result") {
      attachStoredToolResult(result, value);
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const parsed = messageFromRecord(value, `history-${result.length}`);
    if (parsed) result.push(parsed);
  }
  return result;
}

export function groupConversation(messages: ChatMessage[]): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (message.role === "assistant" && previous?.type === "assistant") {
      previous.messages.push(message);
      continue;
    }
    groups.push(message.role === "user"
      ? { type: "user", id: message.id, message }
      : { type: "assistant", id: message.id, messages: [message] });
  }
  return groups;
}

export function settleAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => message.role === "assistant" && message.streaming
    ? { ...message, streaming: false }
    : message);
}

export function splitAssistantTurn(messages: ChatMessage[], active = false): { work: TurnWorkEntry[]; responses: TurnResponseEntry[] } {
  const timeline: TurnWorkEntry[] = [];
  messages.forEach((message) => {
    const textItems = message.work.filter((item): item is Extract<WorkItem, { type: "text" }> => item.type === "text");
    for (const item of message.work) {
      timeline.push({ key: `${message.id}:${item.id}`, message, item });
    }
    if (textItems.length === 0 && message.text.trim()) {
      timeline.push({
        key: `${message.id}:fallback-text`,
        message,
        item: { type: "text", id: "fallback-text", text: message.text },
      });
    }
  });

  const work: TurnWorkEntry[] = [];
  const responses: TurnResponseEntry[] = [];
  timeline.forEach((entry) => {
    // A restored Devin transcript can contain tool updates after an assistant
    // message. Treating only text after the final tool as a response hides
    // legitimate history inside the collapsed work log. Once a turn is
    // settled, every assistant text segment is user-visible conversation;
    // only thoughts and tool activity belong in the collapsible log.
    if (!active && entry.item.type === "text") {
      responses.push({ key: entry.key, text: entry.item.text, streaming: false });
    } else {
      work.push(entry);
    }
  });
  responses.forEach((response, index) => {
    if (index < responses.length - 1) response.streaming = false;
  });
  return { work, responses };
}

export function getAssistantActivity(messages: ChatMessage[]): AssistantActivity {
  return messages.some((message) => message.tools.some((tool) => tool.status === "running" || tool.status === "pending"))
    ? "tool"
    : "thinking";
}

/** Reduce one normalized ACP event. Unknown events are retained as diagnostics. */
export function reduceConversation(state: ConversationState, event: AgentEvent): ConversationState {
  if (event.sessionId !== state.sessionId) return state;
  switch (event.type) {
    case "message_chunk":
      return { ...state, messages: applyMessageChunk(state.messages, event) };
    case "thought_chunk":
      return { ...state, messages: applyThoughtChunk(state.messages, event) };
    case "tool_start":
      return { ...state, messages: upsertLastAssistantTool(state.messages, {
        id: event.toolId,
        name: event.name,
        title: event.title ?? toolTitle(event.name, event.args),
        status: "running",
        startedAt: eventTimestamp(event.timestamp),
        ...(event.args !== undefined ? { args: event.args } : {}),
      }) };
    case "tool_update":
      return { ...state, messages: upsertLastAssistantTool(state.messages, {
        id: event.toolId,
        name: event.name ?? "tool",
        title: event.title ?? toolTitle(event.name ?? "tool", event.args),
        status: event.status ?? "running",
        ...(event.args !== undefined ? { args: event.args } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(event.timestamp !== undefined ? { startedAt: eventTimestamp(event.timestamp) } : {}),
      }) };
    case "tool_end":
      return { ...state, messages: upsertLastAssistantTool(state.messages, {
        id: event.toolId,
        name: event.name ?? "tool",
        title: event.title ?? toolTitle(event.name ?? "tool", undefined),
        status: event.status ?? (event.isError ? "error" : "complete"),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(event.error !== undefined ? { error: event.error } : {}),
        endedAt: eventTimestamp(event.timestamp),
      }) };
    case "plan":
      return { ...state, plan: event.plan };
    case "commands":
      return { ...state, commands: event.commands };
    case "mode":
      return { ...state, currentModeId: event.modeId };
    case "config":
      return { ...state, configOptions: { ...state.configOptions, [event.option.id]: event.option } };
    case "config_options":
      return { ...state, configOptions: Object.fromEntries(event.options.map((option) => [option.id, option])) };
    case "usage":
      return { ...state, usage: event.usage };
    case "session_info":
      return state;
    case "error":
      return { ...state, lastError: { message: event.message, recoverable: event.recoverable !== false, timestamp: eventTimestamp(event.timestamp) } };
    case "unknown": {
      const diagnostic = toRawDiagnostic(event);
      return { ...state, unknownEvents: appendDiagnostic(state.unknownEvents, diagnostic) };
    }
  }
}

/** Convenience reducer for consumers that only hold the message list. */
export function applyAgentEvent(messages: ChatMessage[], event: AgentEvent | LegacyAgentEvent): ChatMessage[] {
  if (isLegacyEvent(event)) return applyLegacyEvent(messages, event);
  return reduceConversation(createConversationState(event.sessionId, messages), event).messages;
}

export function optimisticUserMessage(text: string, queued = false, images: ChatImage[] = [], annotations: ChatAnnotation[] = [], mentions: MentionRef[] = []): ChatMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "user",
    text,
    timestamp: Date.now(),
    ...(queued ? { queued: true } : {}),
    images,
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
    tools: [],
    work: text ? [{ type: "text", id: "text-0", text }] : [],
  };
}

export function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (isRecord(content) && typeof content.text === "string") return content.text;
  if (!Array.isArray(content)) return "";
  return content
    .filter(isRecord)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("");
}

function applyMessageChunk(messages: ChatMessage[], event: Extract<AgentEvent, { type: "message_chunk" }>): ChatMessage[] {
  const incomingText = event.text;
  if (event.role === "user") {
    const parsed = parsePromptAnnotations(incomingText);
    const last = messages.at(-1);
    if (last?.role === "user" && (last.text === parsed.text || event.messageId === last.id || (!parsed.text && (event.mentions?.length ?? 0) > 0))) {
      return messages.map((message, index) => index === messages.length - 1 ? {
        ...message,
        text: parsed.text || message.text,
        annotations: parsed.annotations.length > 0 ? parsed.annotations : message.annotations,
        queued: false,
        timestamp: event.timestamp ?? message.timestamp,
        images: event.images && event.images.length > 0 ? event.images : message.images,
        mentions: mergeMentions(message.mentions, event.mentions),
      } : message);
    }
    return [...messages, makeMessage(event.role, incomingText, event)];
  }

  const targetIndex = findAssistantTarget(messages, event.messageId, event.phase);
  const streaming = event.phase !== "end";
  if (targetIndex < 0) return [...messages, makeMessage("assistant", incomingText, event, streaming)];
  return messages.map((message, index) => {
    if (index !== targetIndex) return message;
    const text = event.phase === "start" ? incomingText : `${message.text}${incomingText}`;
    const work = appendWorkText(message.work, event.messageId ?? message.id, incomingText, event.phase === "start");
    return {
      ...message,
      text,
      streaming,
      ...(event.timestamp !== undefined ? { timestamp: message.timestamp ?? event.timestamp } : {}),
      ...(event.images && event.images.length > 0 ? { images: [...message.images, ...event.images] } : {}),
      work,
    };
  });
}

/** Compatibility adapter for copied Desktop callers that still emit the old
 * message/tool event names. It is a boundary only; all new code uses the
 * normalized ACP event vocabulary above. */
type LegacyAgentEvent = {
  type: string;
  message?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  isError?: unknown;
  timestamp?: unknown;
};

function applyLegacyEvent(messages: ChatMessage[], event: LegacyAgentEvent): ChatMessage[] {
  if (event.type === "message_start" || event.type === "message_update" || event.type === "message_end") {
    if (!isRecord(event.message) || (event.message.role !== "user" && event.message.role !== "assistant")) return messages;
    const incoming = messageFromRecord(event.message, `event-${Date.now()}-${messages.length}`);
    if (!incoming) return messages;
    if (incoming.role === "user") {
      const last = messages.at(-1);
      if (last?.role === "user" && last.text === incoming.text) return messages.map((message, index) => index === messages.length - 1 ? { ...message, queued: false, timestamp: incoming.timestamp ?? message.timestamp, images: incoming.images.length > 0 ? incoming.images : message.images } : message);
      return event.type === "message_start" ? [...messages, incoming] : messages;
    }
    const streamingIndex = findLastAssistantInCurrentTurn(messages, true);
    const lastAssistantIndex = findLastAssistantInCurrentTurn(messages, false);
    const targetIndex = streamingIndex >= 0 ? streamingIndex : event.type === "message_start" ? -1 : lastAssistantIndex;
    const streaming = event.type !== "message_end";
    if (targetIndex < 0 || event.type === "message_start") return [...messages, { ...incoming, streaming }];
    return messages.map((message, index) => index === targetIndex ? { ...incoming, id: message.id, streaming, tools: mergeTools(message.tools, incoming.tools), work: mergeWork(message.work, incoming.work, incoming.tools) } : message);
  }
  if (event.type === "tool_execution_start" || event.type === "tool_execution_update" || event.type === "tool_execution_end") {
    const toolId = typeof event.toolCallId === "string" ? event.toolCallId : `tool-${Date.now()}`;
    const name = typeof event.toolName === "string" ? event.toolName : "tool";
    const timestamp = eventTimestamp(event.timestamp);
    const status: ToolStatus = event.type === "tool_execution_start" ? "running" : event.type === "tool_execution_end" ? (event.isError === true ? "error" : "complete") : "running";
    return upsertLastAssistantTool(messages, {
      id: toolId,
      name,
      title: toolTitle(name, event.args),
      status,
      ...(event.type === "tool_execution_start" ? { startedAt: timestamp } : { endedAt: timestamp }),
      ...(event.args !== undefined ? { args: event.args } : {}),
      ...((event.result ?? event.partialResult) !== undefined ? { output: stringifyToolResult(event.result ?? event.partialResult) } : {}),
    });
  }
  return messages;
}

function isLegacyEvent(event: AgentEvent | LegacyAgentEvent): event is LegacyAgentEvent {
  return event.type === "message_start" || event.type === "message_update" || event.type === "message_end" || event.type === "tool_execution_start" || event.type === "tool_execution_update" || event.type === "tool_execution_end";
}

function mergeTools(current: ToolActivity[], incoming: ToolActivity[]): ToolActivity[] {
  const merged = [...current];
  for (const tool of incoming) {
    const index = merged.findIndex((candidate) => candidate.id === tool.id);
    if (index < 0) merged.push(tool); else merged[index] = { ...merged[index]!, ...tool };
  }
  return merged;
}

function mergeWork(current: WorkItem[], incoming: WorkItem[], tools: ToolActivity[]): WorkItem[] {
  const merged = incoming.length > 0 ? incoming : current;
  const toolIds = new Set(merged.flatMap((item) => item.type === "tool" ? [item.toolId] : []));
  return [...merged, ...tools.filter((tool) => !toolIds.has(tool.id)).map((tool) => ({ type: "tool" as const, id: `tool-${tool.id}`, toolId: tool.id }))];
}

function applyThoughtChunk(messages: ChatMessage[], event: Extract<AgentEvent, { type: "thought_chunk" }>): ChatMessage[] {
  const targetIndex = findAssistantTarget(messages, event.messageId, event.phase);
  if (targetIndex < 0) {
    return [...messages, makeThoughtMessage(event)];
  }
  return messages.map((message, index) => {
    if (index !== targetIndex) return message;
    const thinking = event.phase === "start" ? event.text : `${message.thinking ?? ""}${event.text}`;
    const work = appendWorkThinking(message.work, event.messageId ?? message.id, event.text, event.phase === "start");
    return { ...message, thinking, streaming: event.phase !== "end", work };
  });
}

function makeMessage(role: "user" | "assistant", text: string, event: { messageId?: string; timestamp?: number; images?: ChatImage[]; mentions?: MentionRef[]; phase?: string }, streaming = false): ChatMessage {
  const id = event.messageId ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const parsed = role === "user" ? parsePromptAnnotations(text) : { text, annotations: [] };
  return {
    id,
    role,
    text: parsed.text,
    ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
    ...(role === "assistant" ? { streaming } : {}),
    ...(parsed.annotations.length > 0 ? { annotations: parsed.annotations } : {}),
    ...(event.images ? { images: event.images } : { images: [] }),
    ...(event.mentions && event.mentions.length > 0 ? { mentions: event.mentions } : {}),
    tools: [],
    work: parsed.text ? [{ type: "text", id: `text-${id}`, text: parsed.text }] : [],
  };
}

function mergeMentions(current: readonly MentionRef[] | undefined, incoming: readonly MentionRef[] | undefined): MentionRef[] | undefined {
  if (!incoming || incoming.length === 0) return current ? [...current] : undefined;
  const merged = new Map((current ?? []).map((mention) => [mentionIdentity(mention), mention]));
  for (const mention of incoming) {
    const key = mentionIdentity(mention);
    const existing = merged.get(key);
    merged.set(key, existing && isPositionedMention(existing) ? { ...mention, ...existing } : mention);
  }
  return [...merged.values()];
}

function mentionIdentity(mention: MentionRef): string {
  return mention.kind === "skill"
    ? `skill:${mention.command.toLocaleLowerCase()}`
    : `${mention.kind}:${mention.path.toLocaleLowerCase()}`;
}

function makeThoughtMessage(event: Extract<AgentEvent, { type: "thought_chunk" }>): ChatMessage {
  const id = event.messageId ?? `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    role: "assistant",
    text: "",
    ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
    streaming: event.phase !== "end",
    thinking: event.text,
    images: [],
    tools: [],
    work: event.text ? [{ type: "thinking", id: `thinking-${id}`, text: event.text }] : [],
  };
}

function findAssistantTarget(messages: ChatMessage[], messageId?: string, phase?: string): number {
  const currentTurnStart = findLastUserIndex(messages);
  if (messageId) {
    const byId = messages.findIndex((message) => message.id === messageId && message.role === "assistant");
    if (byId > currentTurnStart) return byId;
    // ACP defines a changed messageId as a new message boundary. Falling back
    // to the previous streaming message here merges distinct messages and can
    // move later content ahead of intervening tool activity.
    return -1;
  }
  if (phase === "start") return -1;
  const streamingIndex = findLastAssistantInCurrentTurn(messages, true);
  return streamingIndex >= 0 ? streamingIndex : findLastAssistantInCurrentTurn(messages, false);
}

function appendWorkText(work: WorkItem[], messageId: string, text: string, replace: boolean): WorkItem[] {
  if (!text) return work;
  const idPrefix = `text-${messageId}`;
  const lastIndex = work.length - 1;
  const last = work[lastIndex];
  if (last?.type === "text" && belongsToWorkSegment(last.id, idPrefix)) {
    return work.map((item, itemIndex) => itemIndex === lastIndex && item.type === "text" ? { ...item, text: replace ? text : item.text + text } : item);
  }
  return [...work, { type: "text", id: nextWorkSegmentId(work, idPrefix), text }];
}

function appendWorkThinking(work: WorkItem[], messageId: string, text: string, replace: boolean): WorkItem[] {
  if (!text) return work;
  const idPrefix = `thinking-${messageId}`;
  const lastIndex = work.length - 1;
  const last = work[lastIndex];
  if (last?.type === "thinking" && belongsToWorkSegment(last.id, idPrefix)) {
    return work.map((item, itemIndex) => itemIndex === lastIndex && item.type === "thinking" ? { ...item, text: replace ? text : item.text + text } : item);
  }
  return [...work, { type: "thinking", id: nextWorkSegmentId(work, idPrefix), text }];
}

function belongsToWorkSegment(itemId: string, idPrefix: string): boolean {
  return itemId === idPrefix || itemId.startsWith(`${idPrefix}:segment-`);
}

function nextWorkSegmentId(work: WorkItem[], idPrefix: string): string {
  const ids = new Set(work.map((item) => item.id));
  if (!ids.has(idPrefix)) return idPrefix;
  let segment = 2;
  while (ids.has(`${idPrefix}:segment-${segment}`)) segment += 1;
  return `${idPrefix}:segment-${segment}`;
}

function messageFromRecord(value: JsonRecord, id: string): ChatMessage | undefined {
  if (value.role !== "user" && value.role !== "assistant") return undefined;
  const content = value.content;
  const rawText = getMessageText(content);
  const parsed = value.role === "user" ? parsePromptAnnotations(rawText) : { text: rawText, annotations: [] };
  const text = parsed.text;
  const thinking = getThinking(content);
  const images = getImages(content);
  const mentions = getMentions(content);
  const timestamp = normalizeTimestamp(value.timestamp);
  const tools = getTools(content, timestamp);
  const work = value.role === "assistant" ? getWork(content) : text ? [{ type: "text" as const, id: `text-${id}`, text }] : [];
  return {
    id,
    role: value.role,
    text,
    ...(parsed.annotations.length > 0 ? { annotations: parsed.annotations } : {}),
    images,
    ...(mentions.length > 0 ? { mentions } : {}),
    ...(thinking ? { thinking } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    tools,
    work,
  };
}

function getMentions(content: unknown): MentionRef[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap<MentionRef>((part, index) => {
    if (!isRecord(part)) return [];
    if (part.type === "resource_link" && typeof part.uri === "string") {
      const name = typeof part.name === "string" ? part.name : decodeResourceName(part.uri);
      const directory = name.endsWith("/");
      const relativePath = name.replace(/^@/, "").replace(/\/$/, "");
      if (!relativePath) return [];
      return directory
        ? [{ id: `history-directory-${index}-${relativePath}`, kind: "directory", label: relativePath, path: relativePath }]
        : [{ id: `history-file-${index}-${relativePath}`, kind: "file", label: relativePath, path: relativePath, ...(typeof part.size === "number" ? { size: part.size } : {}), ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}) }];
    }
    if (part.type === "resource" && isRecord(part.resource) && typeof part.resource.uri === "string") {
      const relativePath = decodeResourceName(part.resource.uri);
      if (!relativePath) return [];
      return [{ id: `history-file-${index}-${relativePath}`, kind: "file", label: relativePath, path: relativePath, ...(typeof part.resource.mimeType === "string" ? { mimeType: part.resource.mimeType } : {}) }];
    }
    return [];
  });
}

function decodeResourceName(uri: string): string {
  try {
    return decodeURIComponent(new URL(uri).pathname).replace(/^.*\//, "");
  } catch {
    return uri.replace(/^.*\//, "");
  }
}

function getImages(content: unknown): ChatImage[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap<ChatImage>((part) => {
    if (!isRecord(part) || part.type !== "image") return [];
    const data = typeof part.data === "string" ? part.data : "";
    const mimeType = typeof part.mimeType === "string" ? part.mimeType : "";
    return data && mimeType.startsWith("image/") ? [{ data, mimeType }] : [];
  });
}

function getThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.filter(isRecord).filter((part) => (part.type === "thinking" || part.type === "thought") && typeof (part.thinking ?? part.text) === "string").map((part) => String(part.thinking ?? part.text)).join("");
}

function getTools(content: unknown, startedAt?: number): ToolActivity[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord).flatMap<ToolActivity>((part, index) => {
    if (part.type !== "toolCall" && part.type !== "tool_call") return [];
    const name = typeof part.name === "string" ? part.name : "tool";
    const id = typeof part.id === "string" ? part.id : `content-tool-${index}`;
    return [{ id, name, title: toolTitle(name, part.arguments ?? part.rawInput), status: "complete", ...(startedAt !== undefined ? { startedAt } : {}), args: part.arguments ?? part.rawInput }];
  });
}

function getWork(content: unknown): WorkItem[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord).flatMap<WorkItem>((part, index) => {
    if ((part.type === "thinking" || part.type === "thought") && typeof (part.thinking ?? part.text) === "string" && String(part.thinking ?? part.text).trim()) return [{ type: "thinking", id: `thinking-${index}`, text: String(part.thinking ?? part.text) }];
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) return [{ type: "text", id: `text-${index}`, text: part.text }];
    if ((part.type === "toolCall" || part.type === "tool_call") && typeof part.name === "string") {
      const toolId = typeof part.id === "string" ? part.id : `content-tool-${index}`;
      return [{ type: "tool", id: `tool-${toolId}`, toolId }];
    }
    return [];
  });
}

function attachStoredToolResult(messages: ChatMessage[], result: JsonRecord): void {
  const toolCallId = typeof result.toolCallId === "string" ? result.toolCallId : typeof result.tool_call_id === "string" ? result.tool_call_id : "";
  if (!toolCallId) return;
  const endedAt = normalizeTimestamp(result.timestamp);
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]!;
    const toolIndex = message.tools.findIndex((tool) => tool.id === toolCallId);
    if (toolIndex < 0) continue;
    const tools = [...message.tools];
    tools[toolIndex] = { ...tools[toolIndex]!, status: result.isError === true ? "error" : "complete", ...(endedAt !== undefined ? { endedAt } : {}), output: stringifyToolResult(result.content ?? result.output ?? result) };
    messages[messageIndex] = { ...message, tools };
    return;
  }
}

function upsertLastAssistantTool(messages: ChatMessage[], activity: ToolActivity): ChatMessage[] {
  let index = findLastAssistantInCurrentTurn(messages, false);
  let next = messages;
  if (index < 0) {
    next = [...messages, { id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`, role: "assistant", text: "", timestamp: activity.startedAt ?? Date.now(), streaming: false, images: [], tools: [], work: [] }];
    index = next.length - 1;
  }
  return next.map((message, messageIndex) => {
    if (messageIndex !== index) return message;
    const toolIndex = message.tools.findIndex((tool) => tool.id === activity.id);
    const tools = toolIndex < 0 ? [...message.tools, activity] : message.tools.map((tool, candidateIndex) => candidateIndex === toolIndex ? { ...tool, ...activity, name: activity.name || tool.name, title: activity.title || tool.title, args: activity.args ?? tool.args, output: activity.output ?? tool.output } : tool);
    const hasWorkItem = message.work.some((item) => item.type === "tool" && item.toolId === activity.id);
    const work = hasWorkItem ? message.work : [...message.work, { type: "tool" as const, id: `tool-${activity.id}`, toolId: activity.id }];
    return { ...message, tools, work };
  });
}

function findLastAssistantInCurrentTurn(messages: ChatMessage[], streamingOnly: boolean): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user") return -1;
    if (message.role === "assistant" && (!streamingOnly || message.streaming)) return index;
  }
  return -1;
}

function findLastUserIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") return index;
  }
  return -1;
}

function appendDiagnostic(diagnostics: RawDiagnostic[], diagnostic: RawDiagnostic): RawDiagnostic[] {
  if (diagnostics.some((item) => item.updateId && item.updateId === diagnostic.updateId)) return diagnostics;
  return [...diagnostics, diagnostic].slice(-100);
}

function eventTimestamp(value: unknown): number {
  return normalizeTimestamp(value) ?? Date.now();
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1_000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toolTitle(name: string, args: unknown): string {
  const record = isRecord(args) ? args : {};
  const command = stringField(record, "cmd") || stringField(record, "command");
  const file = stringField(record, "path") || stringField(record, "file_path");
  if (name.includes("exec") || name.includes("bash") || name.includes("command")) return command ? `Ran ${crop(command, 90)}` : "Ran a command";
  if (name.includes("read")) return file ? `Read ${file}` : "Read files";
  if (name.includes("write")) return file ? `Wrote ${file}` : "Wrote a file";
  if (name.includes("edit") || name.includes("patch")) return file ? `Edited ${file}` : "Edited files";
  if (name.includes("search")) return "Searched the workspace";
  if (name === "update_plan") return "Updated the plan";
  return name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function stringifyToolResult(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return crop(value, 12_000);
  if (Array.isArray(value)) {
    const text = getMessageText(value);
    if (text) return crop(text, 12_000);
  }
  if (isRecord(value) && typeof value.content === "string") return crop(value.content, 12_000);
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = getMessageText(value.content);
    if (text) return crop(text, 12_000);
  }
  try { return crop(JSON.stringify(value, null, 2), 12_000); } catch { return String(value); }
}

function stringField(value: JsonRecord, key: string): string { return typeof value[key] === "string" ? value[key] as string : ""; }
function crop(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
