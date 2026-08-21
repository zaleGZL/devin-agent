/** Public types shared by the Electron preload and React renderer. */

import type { DevinCapabilities } from "./capabilities";

export const PROVIDER_IDS = ["devin"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const AUTH_PROMPT_CANCEL_VALUE = "__devin_auth_prompt_cancel__";

/** Devin CLI mode identifiers are runtime advertised; unknown values remain valid. */
export type PermissionMode = string;
export type SandboxMode = string;
export type LanguagePreference = "system" | "zh-CN" | "en";

export const TONE_PRESETS = [
  "default",
  "professional",
  "friendly",
  "candid",
  "quirky",
  "efficient",
  "cynical",
  "inspiring",
] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

export interface PersonalizationSettings {
  tone: TonePreset;
  customInstructions: string;
}

export interface UserProfile {
  nickname: string;
  avatarDataUrl?: string;
}

export interface WorkspaceItem {
  path: string;
  name: string;
  lastOpenedAt: string;
}

/** Server-owned session metadata plus optional app-local presentation fields. */
export interface SessionSummary {
  /** Stable Devin session id. */
  id: string;
  path: string;
  storagePath?: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider?: ProviderId;
  model?: string;
  messageCount?: number;
  preview?: string;
  pinned?: boolean;
  archived?: boolean;
  locked?: boolean;
  additionalDirectories?: string[];
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  configured: boolean;
  source?: "stored" | "environment" | "external-cli";
  defaultModel: string;
  version?: string;
  binaryPath?: string;
  authenticated?: boolean | "unknown";
  error?: string;
}

export interface ThemePalette {
  canvas: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  terminalBackground?: string;
  terminalForeground?: string;
}

export interface ThemeSummary {
  id: string;
  displayName: string;
  description?: string;
  previewDataUrl?: string;
  mode: "light" | "dark";
  palette: ThemePalette;
}

export type FilePreviewKind = "html" | "markdown" | "image" | "pdf" | "video" | "audio" | "code" | "text" | "unsupported";

export interface FilePreview {
  id: string;
  path: string;
  name: string;
  extension: string;
  kind: FilePreviewKind;
  url: string;
  size: number;
  modifiedAt: string;
  content?: string;
  tooLarge?: boolean;
}

export interface AgentStartOptions {
  cwd?: string;
  project?: boolean;
  provider: ProviderId;
  model?: string;
  effort?: string;
  permission: PermissionMode;
  sandbox: SandboxMode;
  sessionPath?: string;
  sessionId?: string;
  additionalDirectories?: string[];
}

export interface AgentSessionStats {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost?: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

export interface AgentSnapshot {
  state: Record<string, unknown>;
  messages: unknown[];
  models: Array<{ provider?: string; id: string; name?: string; description?: string; contextWindow?: number; reasoning?: boolean; supportsImages?: boolean }>;
  thinkingLevels: string[];
  stats?: AgentSessionStats;
  sessionId?: string;
  modes?: Array<{ id: string; name?: string; description?: string }>;
  configOptions?: Array<{ id: string; name?: string; description?: string; value?: unknown; options?: unknown[] }>;
  capabilities?: DevinCapabilities;
  locked?: boolean;
}

export type AgentEvent = Record<string, unknown> & { type: string; sessionId?: string; updateId?: string; timestamp?: string };

export type ExtensionUiRequest = {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
  [key: string]: unknown;
};

export type AuthUiEvent =
  | { kind: "prompt"; id: string; prompt: { type: string; message: string; placeholder?: string; options?: Array<{ id: string; label: string; description?: string }> } }
  | { kind: "notice"; event: { type: string; message?: string; url?: string; instructions?: string; userCode?: string; verificationUri?: string } }
  | { kind: "complete"; providerId: ProviderId; modelId?: string }
  | { kind: "error"; message: string };

export interface DesktopApi {
  platform: NodeJS.Platform;
  app: {
    version(): Promise<string>;
    homeDirectory(): Promise<string>;
    openExternal(url: string): Promise<void>;
  };
  themes: {
    list(): Promise<ThemeSummary[]>;
    getActive(): Promise<string | null>;
    setActive(id: string | null): Promise<void>;
  };
  settings: {
    getLanguage(): Promise<LanguagePreference>;
    setLanguage(language: LanguagePreference): Promise<void>;
    getProfile(): Promise<UserProfile>;
    setProfile(profile: UserProfile): Promise<void>;
    getShowReasoningProcess(): Promise<boolean>;
    setShowReasoningProcess(value: boolean): Promise<void>;
    getPersonalization(): Promise<PersonalizationSettings>;
    setPersonalization(personalization: PersonalizationSettings): Promise<void>;
    getPinnedModelIds(): Promise<string[]>;
    setPinnedModelIds(modelIds: string[]): Promise<void>;
    getDevinCliPath(): Promise<string | null>;
    setDevinCliPath(path: string | null): Promise<ProviderStatus>;
    chooseDevinCliPath(): Promise<ProviderStatus | null>;
  };
  workspace: {
    choose(): Promise<string | null>;
    recent(): Promise<WorkspaceItem[]>;
    forget(path: string): Promise<WorkspaceItem[]>;
  };
  files: {
    choosePreview(): Promise<FilePreview | null>;
    validPreviewPaths(paths: string[]): Promise<string[]>;
    preview(path: string): Promise<FilePreview>;
    openPreview(id: string): Promise<void>;
  };
  sessions: {
    list(cwd?: string): Promise<SessionSummary[]>;
    delete?(id: string): Promise<void>;
    pin?(id: string, pinned: boolean): Promise<boolean>;
    archive?(id: string): Promise<SessionSummary | undefined>;
    unarchive?(id: string): Promise<SessionSummary | undefined>;
  };
  auth: {
    status(): Promise<ProviderStatus[]>;
    /** Devin auth is owned by the external CLI; key persistence is intentionally unavailable. */
    saveApiKey?(provider: ProviderId, key: string, baseUrl?: string): Promise<void>;
    login(provider: ProviderId): Promise<boolean>;
    respond(id: string, value: string): Promise<void>;
    logout(provider: ProviderId): Promise<void>;
    onEvent(listener: (event: AuthUiEvent) => void): () => void;
  };
  agent: {
    start(options: AgentStartOptions): Promise<AgentSnapshot>;
    stop(): Promise<void>;
    command<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T>;
    respondToUi(id: string, response: Record<string, unknown>): Promise<void>;
    onEvent(listener: (event: AgentEvent) => void): () => void;
    onError(listener: (message: string) => void): () => void;
  };
  onAppCommand?(listener: (command: string) => void): () => void;
}
