/** Public types shared by the Electron preload and React renderer. */

import type { DevinCapabilities } from "./capabilities";
import type { MarkdownExportRequest, MarkdownExportResult } from "./markdown-export";
import type { MentionSearchRequest, MentionSearchResult, SkillListRequest, SkillMentionRef } from "./mentions";

export const PROVIDER_IDS = ["devin"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const AUTH_PROMPT_CANCEL_VALUE = "__devin_auth_prompt_cancel__";

/** Devin CLI mode identifiers are runtime advertised; unknown values remain valid. */
export type PermissionMode = string;
export type SandboxMode = string;
export type ColorSchemePreference = "system" | "light" | "dark";
export type LanguagePreference = "system" | "zh-CN" | "en";

export interface UserProfile {
  nickname: string;
  avatarDataUrl?: string;
}

export type WeixinConnectionState =
  | "unconfigured"
  | "workspace-ready"
  | "login-required"
  | "connecting"
  | "online"
  | "paused"
  | "error";

export interface WeixinMedia {
  kind: "image" | "voice" | "file" | "video";
  name: string;
  mimeType: string;
  size: number;
  localPath?: string;
}

export interface WeixinMessage {
  id: number;
  platformId?: string;
  direction: "inbound" | "outbound";
  source: "weixin" | "desktop" | "agent" | "system";
  role: "user" | "assistant" | "system";
  text: string;
  media: WeixinMedia[];
  status: "pending" | "processing" | "sent" | "failed";
  createdAt: string;
}

export interface WeixinBotStatus {
  state: WeixinConnectionState;
  workspacePath?: string;
  sessionId?: string;
  accountId?: string;
  boundUserId?: string;
  online: boolean;
  autoLaunch: boolean;
  running: boolean;
  lastError?: string;
  contextUsage?: AgentSessionStats["contextUsage"];
  mediaBytes: number;
  modelId?: string;
  modeId?: string;
}

export interface WeixinLoginSession {
  sessionId: string;
  qrContent: string;
  qrImageDataUrl: string;
  expiresAt: string;
}

export interface WeixinLoginState {
  state: "waiting" | "scanned" | "verify-required" | "expired" | "connected" | "error";
  message: string;
}

export interface WeixinHistoryPage {
  messages: WeixinMessage[];
  hasMore: boolean;
  before?: number;
}

export type WeixinBotEvent =
  | { type: "status"; status: WeixinBotStatus }
  | { type: "message"; message: WeixinMessage }
  | { type: "history-reset" };

export type TelegramConnectionState =
  | "unconfigured"
  | "workspace-ready"
  | "token-required"
  | "connecting"
  | "online"
  | "paused"
  | "error";

export interface TelegramMedia {
  kind: "image" | "voice" | "file" | "video";
  name: string;
  mimeType: string;
  size: number;
  localPath?: string;
}

export interface TelegramMessage {
  id: number;
  platformId?: string;
  direction: "inbound" | "outbound";
  source: "telegram" | "desktop" | "agent" | "system";
  role: "user" | "assistant" | "system";
  text: string;
  media: TelegramMedia[];
  status: "pending" | "processing" | "sent" | "failed";
  createdAt: string;
}

export interface TelegramBotStatus {
  state: TelegramConnectionState;
  workspacePath?: string;
  sessionId?: string;
  botId?: number;
  boundChatId?: number;
  online: boolean;
  autoLaunch: boolean;
  running: boolean;
  lastError?: string;
  contextUsage?: AgentSessionStats["contextUsage"];
  mediaBytes: number;
  modelId?: string;
  modeId?: string;
  models: { provider?: string; id: string; name?: string }[];
  modes: { id: string; name?: string }[];
}

export interface TelegramHistoryPage {
  messages: TelegramMessage[];
  hasMore: boolean;
  before?: number;
}

export type TelegramBotEvent =
  | { type: "status"; status: TelegramBotStatus }
  | { type: "message"; message: TelegramMessage }
  | { type: "history-reset" };

export interface WorkspaceItem {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export type WorkspaceChangeKind = "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted";

export interface WorkspaceChange {
  path: string;
  oldPath?: string;
  kind: WorkspaceChangeKind;
  indexStatus: string;
  workingTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
}

export interface WorkspaceChanges {
  workspacePath: string;
  repositoryRoot?: string;
  branch?: string;
  isRepository: boolean;
  changes: WorkspaceChange[];
  checkedAt: string;
}

export interface WorkspaceDiff {
  change: WorkspaceChange;
  content: string;
  binary: boolean;
  truncated: boolean;
}

/** Server-owned session metadata plus optional app-local presentation fields. */
export interface SessionSummary {
  /** Stable Devin session id. */
  id: string;
  path: string;
  storagePath?: string;
  cwd: string;
  title: string;
  /** App-local title override. Devin remains the transcript source of truth. */
  customTitle?: string;
  /** Records whether the visible title is local-only or confirmed by Devin. */
  titleSource?: "local" | "native" | "server";
  /** Timestamp used to reject stale session/list title snapshots. */
  titleUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  provider?: ProviderId;
  model?: string;
  messageCount?: number;
  preview?: string;
  pinned?: boolean;
  /** App-local order within the current sidebar group. */
  sidebarOrder?: number;
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

export interface DevinCliUpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  state: "latest" | "available" | "unavailable";
  checkedAt: string;
  message?: string;
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
  /** Ask Devin ACP to replay the transcript even when this session is already known by the host. */
  replaySession?: boolean;
  /** Create and immediately remove a temporary ACP session to discover models and modes. */
  capabilitiesOnly?: boolean;
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

export type { DesktopInteractionRequest } from "./interactions";

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
    copyText(text: string): Promise<void>;
    saveMarkdown(request: MarkdownExportRequest): Promise<MarkdownExportResult>;
  };
  settings: {
    getColorScheme(): Promise<ColorSchemePreference>;
    setColorScheme(preference: ColorSchemePreference): Promise<void>;
    getLanguage(): Promise<LanguagePreference>;
    setLanguage(language: LanguagePreference): Promise<void>;
    getProfile(): Promise<UserProfile>;
    setProfile(profile: UserProfile): Promise<void>;
    getShowReasoningProcess(): Promise<boolean>;
    setShowReasoningProcess(value: boolean): Promise<void>;
    getPinnedModelIds(): Promise<string[]>;
    setPinnedModelIds(modelIds: string[]): Promise<void>;
    getNewSessionModelId(): Promise<string | null>;
    setNewSessionModelId(modelId: string): Promise<void>;
    getPreferredModeId(): Promise<PermissionMode | null>;
    setPreferredModeId(modeId: PermissionMode): Promise<void>;
    getDevinCliPath(): Promise<string | null>;
    setDevinCliPath(path: string | null): Promise<ProviderStatus>;
    chooseDevinCliPath(): Promise<ProviderStatus | null>;
    getDevinCliUpdateStatus(): Promise<DevinCliUpdateStatus>;
    updateDevinCli(): Promise<DevinCliUpdateStatus>;
  };
  workspace: {
    choose(): Promise<string | null>;
    recent(): Promise<WorkspaceItem[]>;
    forget(path: string): Promise<WorkspaceItem[]>;
    reorder(paths: string[]): Promise<WorkspaceItem[]>;
    rename(path: string, name: string): Promise<WorkspaceItem[]>;
    openInDevin(path: string): Promise<void>;
    changes(path: string): Promise<WorkspaceChanges>;
    diff(path: string, filePath: string): Promise<WorkspaceDiff>;
  };
  files: {
    choosePreview(): Promise<FilePreview | null>;
    validPreviewPaths(paths: string[]): Promise<string[]>;
    preview(path: string): Promise<FilePreview>;
    openPreview(id: string): Promise<void>;
  };
  mentions: {
    setWorkspace(path?: string): Promise<void>;
    search(request: MentionSearchRequest): Promise<MentionSearchResult[]>;
    skills(request: SkillListRequest): Promise<SkillMentionRef[]>;
  };
  sessions: {
    list(cwd?: string): Promise<SessionSummary[]>;
    delete?(id: string): Promise<void>;
    pin?(id: string, pinned: boolean): Promise<boolean>;
    reorder?(ids: string[]): Promise<boolean>;
    rename?(id: string, title: string): Promise<SessionSummary | undefined>;
    archive?(id: string): Promise<SessionSummary | undefined>;
    unarchive?(id: string): Promise<SessionSummary | undefined>;
    openInNewWindow?(id: string): Promise<void>;
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
    respondToUi(id: string, response: Record<string, unknown>): Promise<{ pending?: boolean } | void>;
    onEvent(listener: (event: AgentEvent) => void): () => void;
    onError(listener: (message: string) => void): () => void;
  };
  weixin: {
    getStatus(): Promise<WeixinBotStatus>;
    chooseWorkspace(): Promise<string | null>;
    configureWorkspace(path: string): Promise<void>;
    chooseAttachments(): Promise<string[]>;
    startLogin(): Promise<WeixinLoginSession>;
    waitLogin(sessionId: string): Promise<WeixinLoginState>;
    submitVerifyCode(sessionId: string, code: string): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    disconnect(): Promise<void>;
    getHistory(query?: { before?: number; limit?: number }): Promise<WeixinHistoryPage>;
    send(input: { text: string; attachmentPaths?: string[] }): Promise<void>;
    abortTurn(): Promise<void>;
    setAutoLaunch(enabled: boolean): Promise<void>;
    clearAllData(confirmation: string): Promise<void>;
    onEvent(listener: (event: WeixinBotEvent) => void): () => void;
  };
  telegram: {
    getStatus(): Promise<TelegramBotStatus>;
    chooseWorkspace(): Promise<string | null>;
    configureWorkspace(path: string): Promise<void>;
    chooseAttachments(): Promise<string[]>;
    saveToken(token: string): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    disconnect(): Promise<void>;
    getHistory(query?: { before?: number; limit?: number }): Promise<TelegramHistoryPage>;
    send(input: { text: string; attachmentPaths?: string[] }): Promise<void>;
    abortTurn(): Promise<void>;
    setAutoLaunch(enabled: boolean): Promise<void>;
    clearAllData(confirmation: string): Promise<void>;
    onEvent(listener: (event: TelegramBotEvent) => void): () => void;
  };
  onAppCommand?(listener: (command: string) => void): () => void;
}
