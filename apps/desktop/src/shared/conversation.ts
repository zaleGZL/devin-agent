/**
 * Provider-neutral conversation types.
 *
 * These types deliberately describe the view model rather than ACP wire
 * objects.  The ACP adapter is responsible for translating wire updates into
 * this stable shape before the renderer sees them.
 */

import type { MentionRef } from "./mentions";

export type ChatRole = "user" | "assistant";
export type ToolStatus = "pending" | "running" | "complete" | "error" | "cancelled";

export interface ChatImage {
  data: string;
  mimeType: string;
  /** Optional provider supplied URI; data remains the portable representation. */
  uri?: string;
  name?: string;
}

export interface ChatAnnotation {
  id: string;
  text: string;
  comment?: string;
}

export interface ToolActivity {
  id: string;
  name: string;
  title: string;
  status: ToolStatus;
  startedAt?: number;
  endedAt?: number;
  args?: unknown;
  output?: string;
  error?: string;
  expanded?: boolean;
}

export type WorkItem =
  | { type: "thinking"; id: string; text: string }
  | { type: "text"; id: string; text: string }
  | { type: "tool"; id: string; toolId: string };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  thinking?: string;
  timestamp?: number;
  streaming?: boolean;
  queued?: boolean;
  images: ChatImage[];
  annotations?: ChatAnnotation[];
  mentions?: MentionRef[];
  tools: ToolActivity[];
  work: WorkItem[];
}

export type ConversationGroup =
  | { type: "user"; id: string; message: ChatMessage }
  | { type: "assistant"; id: string; messages: ChatMessage[] };

export interface TurnWorkEntry {
  key: string;
  message: ChatMessage;
  item: WorkItem;
}

export interface TurnResponseEntry {
  key: string;
  text: string;
  streaming: boolean;
}

export type AssistantActivity = "thinking" | "tool";

export type PlanStepStatus = "pending" | "in_progress" | "completed";

export interface PlanStep {
  step: string;
  status: PlanStepStatus;
  priority?: number;
}

export interface PlanState {
  explanation?: string;
  steps: PlanStep[];
  updatedAt: number;
}

export interface AvailableCommand {
  name: string;
  description?: string;
  input?: unknown;
  category?: string;
  raw?: Record<string, unknown>;
}

export interface ConfigOptionValue {
  value: string;
  name?: string;
  description?: string;
  supportsImages?: boolean;
  supportsAudio?: boolean;
  contextWindow?: number;
  raw?: unknown;
}

export interface ConfigOptionState {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  currentValue?: string | boolean | number;
  options?: ConfigOptionValue[];
}

export interface UsageState {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  contextWindow?: number;
  cost?: number;
  raw?: unknown;
}

/** Standardized event consumed by the renderer reducer. */
export type AgentEvent = (
  | {
      type: "message_chunk";
      sessionId: string;
      role: ChatRole;
      text: string;
      messageId?: string;
      timestamp?: number;
      phase?: "start" | "update" | "end";
      images?: ChatImage[];
      mentions?: MentionRef[];
    }
  | {
      type: "thought_chunk";
      sessionId: string;
      text: string;
      messageId?: string;
      timestamp?: number;
      phase?: "start" | "update" | "end";
    }
  | {
      type: "tool_start";
      sessionId: string;
      toolId: string;
      name: string;
      title?: string;
      args?: unknown;
      timestamp?: number;
    }
  | {
      type: "tool_update";
      sessionId: string;
      toolId: string;
      name?: string;
      title?: string;
      output?: string;
      args?: unknown;
      status?: ToolStatus;
      timestamp?: number;
    }
  | {
      type: "tool_end";
      sessionId: string;
      toolId: string;
      name?: string;
      title?: string;
      output?: string;
      error?: string;
      isError?: boolean;
      status?: ToolStatus;
      timestamp?: number;
    }
  | { type: "plan"; sessionId: string; plan: PlanState; timestamp?: number }
  | { type: "commands"; sessionId: string; commands: AvailableCommand[]; timestamp?: number }
  | { type: "mode"; sessionId: string; modeId: string; timestamp?: number }
  | { type: "config"; sessionId: string; option: ConfigOptionState; timestamp?: number }
  | { type: "config_options"; sessionId: string; options: ConfigOptionState[]; timestamp?: number }
  | { type: "session_info"; sessionId: string; title?: string; updatedAt?: number; cwd?: string; locked?: boolean; timestamp?: number }
  | { type: "usage"; sessionId: string; usage: UsageState; timestamp?: number }
  | { type: "error"; sessionId: string; message: string; recoverable?: boolean; timestamp?: number }
  | { type: "unknown"; sessionId: string; updateId?: string; timestamp: number; kind: string; raw: unknown; diagnostic: string }
) & { chainId?: string };

export interface ConversationState {
  sessionId: string;
  messages: ChatMessage[];
  plan?: PlanState;
  commands: AvailableCommand[];
  currentModeId?: string;
  configOptions: Record<string, ConfigOptionState>;
  usage?: UsageState;
  unknownEvents: RawDiagnostic[];
  lastError?: { message: string; recoverable: boolean; timestamp: number };
}

export interface RawDiagnostic {
  sessionId: string;
  updateId?: string;
  timestamp: number;
  kind: string;
  raw: unknown;
  redacted: boolean;
  diagnostic: string;
}

export interface SessionUpdateEnvelope {
  sessionId: string;
  updateId?: string;
  timestamp?: number;
  update: unknown;
  /** Unknown Devin extension metadata is intentionally not discarded. */
  meta?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  /** Main-process wrapper retains the original ACP notification envelope. */
  params?: unknown;
}
