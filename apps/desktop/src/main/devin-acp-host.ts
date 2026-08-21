import { isAbsolute } from "node:path";
import {
  asJsonObject,
  asString,
  capabilityAdvertised,
  getSessionLocked,
  normalizeAuthMethodId,
  redactSensitive,
  type AgentCapabilities,
  type AuthMethod,
  type ClientCapabilities,
  type DevinCapabilities,
  type InitializeResult,
  type JsonObject,
  type PermissionDecision,
  type PermissionRequest,
  type PromptContent,
  type SessionCapabilityMap,
  type SessionCreateParams,
  type SessionListResult,
  type SessionLoadParams,
  type SessionSummary,
  type SessionUpdateEnvelope,
} from "../shared/acp-types";
import {
  discoverDevinBinary,
  type DevinBinaryInfo,
  type DevinDiscoveryOptions,
  validateDevinBinary,
} from "./devin-discovery";
import {
  AcpTransport,
  AcpTransportError,
  type AcpExitResult,
  type AcpRequestOptions,
  type AcpSpawnOptions,
  type SpawnFunction,
} from "./acp-transport";

export type DevinHostState =
  | "idle"
  | "starting"
  | "ready"
  | "auth-required"
  | "stopping"
  | "closed"
  | "error";

export interface DevinSessionState extends SessionSummary {
  modes?: unknown;
  configOptions?: unknown[];
  raw: JsonObject;
}

export interface AcpUpdateEvent {
  method: string;
  sessionId?: string;
  update?: JsonObject;
  params: unknown;
  receivedAt: number;
  generation: number;
}

export interface DevinPermissionResult extends PermissionDecision {}

export interface DevinAcpHostOptions {
  /** Absolute path to an externally installed Devin CLI. */
  binaryPath?: string;
  binaryDiscovery?: DevinDiscoveryOptions;
  cwd?: string;
  additionalDirectories?: string[];
  env?: NodeJS.ProcessEnv;
  clientName?: string;
  clientVersion?: string;
  clientCapabilities?: ClientCapabilities;
  requestTimeoutMs?: number;
  initializeTimeoutMs?: number;
  spawn?: SpawnFunction;
  transportFactory?: (command: string, options: AcpSpawnOptions) => AcpTransport;
  onUpdate?: (event: AcpUpdateEvent) => void;
  onNotification?: (method: string, params: unknown) => void;
  onPermissionRequest?: (
    request: PermissionRequest,
  ) => Promise<PermissionDecision | string | null | undefined> | PermissionDecision | string | null | undefined;
  openExternal?: (url: string) => Promise<void> | void;
  onStateChange?: (state: DevinHostState, error?: Error) => void;
  onExit?: (exit: AcpExitResult) => void;
  onDiagnostic?: (diagnostic: DevinDiagnostic) => void;
}

export interface DevinDiagnostic {
  code: string;
  message: string;
  details?: unknown;
  generation: number;
  receivedAt: number;
}

export class DevinAcpError extends Error {
  readonly code:
    | "not-ready"
    | "capability"
    | "invalid-session"
    | "locked"
    | "auth-required"
    | "stale-event"
    | "protocol"
    | "transport";
  readonly details?: unknown;

  constructor(
    code: DevinAcpError["code"],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "DevinAcpError";
    this.code = code;
    this.details = redactSensitive(details);
  }
}

const DEFAULT_CLIENT_NAME = "devin-desktop";
const DEFAULT_CLIENT_VERSION = "0.1.0";

/**
 * Main-process owner for one `devin acp` process and all sessions loaded into it.
 *
 * The class intentionally exposes ACP-shaped values rather than a provider
 * abstraction. Devin's session is the source of truth; the renderer receives
 * only sanitized updates and diagnostics through the caller's IPC adapter.
 */
export class DevinAcpHost {
  private readonly options: DevinAcpHostOptions;
  private state: DevinHostState = "idle";
  private transport: AcpTransport | null = null;
  private binaryInfo: DevinBinaryInfo | null = null;
  private capabilities: DevinCapabilities | null = null;
  private activeSessionId: string | null = null;
  private activeSession: DevinSessionState | null = null;
  private readonly sessions = new Map<string, DevinSessionState>();
  private pendingSessionId: string | null = null;
  private readonly promptRunningSessionIds = new Set<string>();
  private generation = 0;
  private stopping = false;
  private startPromise: Promise<DevinCapabilities> | null = null;
  private diagnostics: DevinDiagnostic[] = [];

  constructor(options: DevinAcpHostOptions) {
    this.options = options;
  }

  get currentState(): DevinHostState {
    return this.state;
  }

  get binary(): DevinBinaryInfo | null {
    return this.binaryInfo;
  }

  get negotiatedCapabilities(): DevinCapabilities | null {
    return this.capabilities;
  }

  get sessionId(): string | null {
    return this.activeSessionId;
  }

  get session(): DevinSessionState | null {
    return this.activeSession;
  }

  get isPromptRunning(): boolean {
    return this.activeSessionId !== null && this.promptRunningSessionIds.has(this.activeSessionId);
  }

  get runningSessionIds(): readonly string[] {
    return [...this.promptRunningSessionIds];
  }

  get recentDiagnostics(): readonly DevinDiagnostic[] {
    return this.diagnostics;
  }

  async start(): Promise<DevinCapabilities> {
    if (this.state === "ready" || this.state === "auth-required") {
      return this.requireCapabilities();
    }
    if (this.state === "stopping" || this.stopping) throw new DevinAcpError("not-ready", "Devin ACP 正在关闭");
    if (this.startPromise) return this.startPromise;

    const operation = this.startConnection();
    this.startPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.startPromise === operation) this.startPromise = null;
    }
  }

  private async startConnection(): Promise<DevinCapabilities> {
    this.stopping = false;
    this.state = "starting";
    this.emitState();
    const generation = ++this.generation;
    try {
      this.binaryInfo = await this.resolveBinary();
      const transport = this.createTransport(this.binaryInfo.path, generation);
      this.transport = transport;
      await transport.start();
      const result = await transport.request<InitializeResult>(
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: this.options.clientCapabilities ?? {},
          clientInfo: {
            name: this.options.clientName ?? DEFAULT_CLIENT_NAME,
            version: this.options.clientVersion ?? DEFAULT_CLIENT_VERSION,
          },
        },
        { timeoutMs: this.options.initializeTimeoutMs ?? this.options.requestTimeoutMs },
      );
      this.capabilities = normalizeCapabilities(result);
      this.state = "ready";
      this.emitState();
      return this.capabilities;
    } catch (error) {
      const normalized = normalizeHostError(error, "Devin ACP 初始化失败");
      if (isAuthRequiredError(normalized)) {
        this.state = "auth-required";
      } else {
        this.state = "error";
      }
      this.emitDiagnostic({ code: normalized.code, message: normalized.message, details: normalized.details, generation });
      this.emitState(normalized);
      // Keep the initialized ACP process alive while authentication is
      // required: `authenticate` is a runtime ACP request on this same host.
      // All other initialization failures close the child before surfacing the
      // diagnostic so no orphan process remains.
      if (!isAuthRequiredError(normalized)) await this.stopTransport();
      throw normalized;
    }
  }

  async authenticate(methodId?: string): Promise<JsonObject> {
    await this.startIfNeeded();
    const capabilities = this.requireCapabilities();
    const method = methodId ?? normalizeAuthMethodId(capabilities.authMethods[0]);
    if (!method) {
      throw new DevinAcpError("capability", "Devin ACP 未广告可用的认证方式");
    }
    const result = await this.request<JsonObject>("authenticate", { methodId: method });
    const url = findAuthUrl(result);
    if (url && this.options.openExternal) {
      await this.options.openExternal(url);
    }
    this.state = "ready";
    this.emitState();
    return result;
  }

  async logout(): Promise<void> {
    await this.startIfNeeded();
    const authCapabilities = asJsonObject((this.requireCapabilities().raw.agentCapabilities as AgentCapabilities | undefined)?.auth);
    if (!capabilityAdvertised(authCapabilities?.logout)) {
      throw new DevinAcpError("capability", "Devin ACP 未广告 logout capability");
    }
    await this.request("logout", {});
    this.state = "auth-required";
    this.emitState();
  }

  async newSession(
    cwd = this.options.cwd,
    options: { additionalDirectories?: string[]; mcpServers?: unknown[] } = {},
  ): Promise<DevinSessionState> {
    await this.startIfNeeded();
    if (!cwd || !isAbsolute(cwd)) {
      throw new DevinAcpError("invalid-session", "session/new 需要绝对 cwd");
    }
    const params: SessionCreateParams = {
      cwd,
      mcpServers: (options.mcpServers ?? []) as never,
    };
    const directories = options.additionalDirectories ?? this.options.additionalDirectories;
    if (directories?.length && this.hasSessionCapability("additionalDirectories")) {
      params.additionalDirectories = directories;
    }
    const result = await this.request<JsonObject>("session/new", params);
    const session = this.sessionFromResult(result, cwd);
    this.setActiveSession(session);
    return session;
  }

  async loadSession(
    sessionId: string,
    options: { cwd?: string; additionalDirectories?: string[]; mcpServers?: unknown[] } = {},
  ): Promise<DevinSessionState> {
    await this.startIfNeeded();
    if (!this.requireCapabilities().supportsLoadSession) {
      throw new DevinAcpError("capability", "当前 Devin ACP 未广告 session/load");
    }
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    const cwd = options.cwd ?? this.options.cwd;
    if (!cwd || !isAbsolute(cwd)) {
      throw new DevinAcpError("invalid-session", "session/load 需要绝对 cwd");
    }
    const params: SessionLoadParams = {
      sessionId,
      cwd,
      mcpServers: (options.mcpServers ?? []) as never,
    };
    const directories = options.additionalDirectories ?? this.options.additionalDirectories;
    if (directories?.length && this.hasSessionCapability("additionalDirectories")) {
      params.additionalDirectories = directories;
    }
    this.pendingSessionId = sessionId;
    try {
      const result = await this.request<JsonObject>("session/load", params);
      const session = this.sessionFromResult(result, cwd, sessionId);
      this.setActiveSession(session);
      return session;
    } finally {
      if (this.pendingSessionId === sessionId) this.pendingSessionId = null;
    }
  }

  async listSessions(options: { cwd?: string; cursor?: string } = {}): Promise<SessionListResult> {
    await this.startIfNeeded();
    this.requireCapability("list");
    const result = await this.request<SessionListResult>("session/list", {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    });
    const sessions = Array.isArray(result.sessions)
      ? result.sessions.filter((session): session is SessionSummary => isSessionSummary(session))
      : [];
    return { ...result, sessions };
  }

  async deleteSession(sessionId: string, summary?: SessionSummary): Promise<void> {
    await this.startIfNeeded();
    this.requireCapability("delete");
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    if (summary && getSessionLocked(summary)) {
      throw new DevinAcpError("locked", "锁定的 Devin session 不允许删除");
    }
    if (this.promptRunningSessionIds.has(sessionId)) {
      throw new DevinAcpError("locked", "当前 session 正在运行，取消后才能删除");
    }
    await this.request("session/delete", { sessionId });
    this.sessions.delete(sessionId);
    this.promptRunningSessionIds.delete(sessionId);
    if (sessionId === this.activeSessionId) {
      this.activeSessionId = null;
      this.activeSession = null;
    }
  }

  async resumeSession(
    sessionId: string,
    options: { cwd?: string; additionalDirectories?: string[]; mcpServers?: unknown[] } = {},
  ): Promise<DevinSessionState> {
    await this.startIfNeeded();
    this.requireCapability("resume");
    const cwd = options.cwd ?? this.options.cwd;
    if (!sessionId || !cwd || !isAbsolute(cwd)) {
      throw new DevinAcpError("invalid-session", "session/resume 需要 sessionId 和绝对 cwd");
    }
    const params: SessionLoadParams = {
      sessionId,
      cwd,
      mcpServers: (options.mcpServers ?? []) as never,
    };
    const directories = options.additionalDirectories ?? this.options.additionalDirectories;
    if (directories?.length && this.hasSessionCapability("additionalDirectories")) {
      params.additionalDirectories = directories;
    }
    const result = await this.request<JsonObject>("session/resume", params);
    const session = this.sessionFromResult(result, cwd, sessionId);
    this.setActiveSession(session);
    return session;
  }

  async closeSession(sessionId = this.activeSessionId): Promise<void> {
    await this.startIfNeeded();
    this.requireCapability("close");
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    await this.cancel(sessionId);
    await this.request("session/close", { sessionId });
    this.sessions.delete(sessionId);
    this.promptRunningSessionIds.delete(sessionId);
    if (sessionId === this.activeSessionId) {
      this.activeSessionId = null;
      this.activeSession = null;
    }
  }

  /** Select another session without interrupting prompts running in siblings. */
  async switchSession(
    sessionId: string,
    options: { cwd?: string; additionalDirectories?: string[] } = {},
  ): Promise<DevinSessionState> {
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    await this.startIfNeeded();
    if (sessionId === this.activeSessionId) return this.activeSession ?? this.loadSession(sessionId, options);
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.setActiveSession(existing);
      return existing;
    }
    return this.loadSession(sessionId, options);
  }

  async prompt(
    prompt: PromptContent[] | string,
    sessionId = this.activeSessionId,
    requestOptions: AcpRequestOptions = {},
  ): Promise<JsonObject> {
    await this.startIfNeeded();
    if (!sessionId || !this.sessions.has(sessionId)) {
      throw new DevinAcpError("invalid-session", "只能向已加载的 session 发送 prompt");
    }
    const session = this.sessions.get(sessionId);
    if (session && getSessionLocked(session)) {
      throw new DevinAcpError("locked", "锁定的 Devin session 处于只读状态");
    }
    if (this.promptRunningSessionIds.has(sessionId)) {
      throw new DevinAcpError("invalid-session", "该 session 已有 prompt 在运行，请先取消");
    }
    const content: PromptContent[] = typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;
    if (!content.length) throw new DevinAcpError("invalid-session", "prompt 不能为空");
    if (content.some((part) => part.type === "image") && this.requireCapabilities().promptCapabilities.image !== true) {
      throw new DevinAcpError("capability", "当前 Devin ACP 未广告图片 prompt capability");
    }
    this.promptRunningSessionIds.add(sessionId);
    try {
      return await this.request<JsonObject>(
        "session/prompt",
        { sessionId, prompt: content },
        requestOptions,
      );
    } catch (error) {
      const normalized = normalizeHostError(error, "发送 Devin prompt 失败");
      if (isAuthRequiredError(normalized)) {
        this.state = "auth-required";
        this.emitState(normalized);
      }
      throw normalized;
    } finally {
      this.promptRunningSessionIds.delete(sessionId);
    }
  }

  async cancel(sessionId = this.activeSessionId): Promise<void> {
    if (!sessionId || !this.transport?.isRunning) return;
    try {
      this.transport.notify("session/cancel", { sessionId });
    } catch (error) {
      if (!this.stopping) throw normalizeHostError(error, "取消 Devin prompt 失败");
    }
  }

  async setMode(modeId: string, sessionId = this.activeSessionId): Promise<JsonObject> {
    await this.startIfNeeded();
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    if (!modeId) throw new DevinAcpError("invalid-session", "modeId 不能为空");
    const result = await this.request<JsonObject>("session/set_mode", { sessionId, modeId });
    if (this.activeSession?.sessionId === sessionId) {
      const modes = asJsonObject(this.activeSession.modes) ?? {};
      this.activeSession.modes = { ...modes, currentModeId: modeId };
    }
    return result;
  }

  async setConfigOption(configId: string, value: string | boolean, sessionId = this.activeSessionId): Promise<JsonObject> {
    await this.startIfNeeded();
    if (!sessionId) throw new DevinAcpError("invalid-session", "sessionId 不能为空");
    if (!configId) throw new DevinAcpError("invalid-session", "configId 不能为空");
    const payload = typeof value === "boolean"
      ? { type: "boolean", value }
      : { value };
    const result = await this.request<JsonObject>("session/set_config_option", { sessionId, configId, ...payload });
    if (this.activeSession?.sessionId === sessionId && Array.isArray(this.activeSession.configOptions)) {
      this.activeSession.configOptions = this.activeSession.configOptions.map((option) => {
        const record = asJsonObject(option);
        return record?.id === configId ? { ...record, currentValue: value } : option;
      });
    }
    return result;
  }

  async stop(): Promise<void> {
    if (this.state === "closed" || this.state === "idle") {
      this.state = "closed";
      return;
    }
    this.stopping = true;
    this.state = "stopping";
    this.emitState();
    ++this.generation;
    for (const sessionId of this.promptRunningSessionIds) await this.cancel(sessionId);
    await this.stopTransport();
    this.activeSessionId = null;
    this.activeSession = null;
    this.pendingSessionId = null;
    this.sessions.clear();
    this.promptRunningSessionIds.clear();
    this.state = "closed";
    this.emitState();
  }

  async restart(): Promise<DevinCapabilities> {
    this.stopping = true;
    ++this.generation;
    for (const sessionId of this.promptRunningSessionIds) await this.cancel(sessionId);
    await this.stopTransport();
    this.capabilities = null;
    this.activeSessionId = null;
    this.activeSession = null;
    this.pendingSessionId = null;
    this.sessions.clear();
    this.promptRunningSessionIds.clear();
    this.state = "idle";
    this.stopping = false;
    return this.start();
  }

  private async startIfNeeded(): Promise<void> {
    if (this.state === "ready" || this.state === "auth-required") return;
    await this.start();
  }

  private async resolveBinary(): Promise<DevinBinaryInfo> {
    if (this.options.binaryPath) {
      return {
        ...(await validateDevinBinary(this.options.binaryPath, {
          env: this.options.env,
          minVersion: this.options.binaryDiscovery?.minVersion,
        })),
        source: "configured",
      };
    }
    return discoverDevinBinary({
      ...this.options.binaryDiscovery,
      env: this.options.env,
    });
  }

  private createTransport(command: string, generation: number): AcpTransport {
    const transportOptions: AcpSpawnOptions = {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      args: ["acp"],
      timeoutMs: this.options.requestTimeoutMs,
      spawn: this.options.spawn,
      onNotification: (method, params) => this.handleNotification(method, params, generation),
      onRequest: (method, params) => this.handleServerRequest(method, params, generation),
      onMalformedMessage: (message) => this.emitDiagnostic({ code: "malformed-acp", message, generation }),
      onExit: (exit) => {
        this.options.onExit?.(exit);
        if (generation !== this.generation || this.stopping) return;
        this.state = "error";
        this.emitDiagnostic({
          code: "acp-exit",
          message: "Devin ACP 进程已退出",
          details: { code: exit.code, signal: exit.signal, stderr: exit.stderr },
          generation,
        });
        this.emitState(new DevinAcpError("transport", "Devin ACP 进程已退出", exit));
      },
    };
    return this.options.transportFactory
      ? this.options.transportFactory(command, transportOptions)
      : new AcpTransport(command, transportOptions);
  }

  private async stopTransport(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    if (!transport) return;
    try {
      await transport.stop({ graceMs: 1_000, killMs: 1_000 });
    } catch {
      // Closing is best effort; pending requests were already rejected by the
      // transport and the host is transitioning to a terminal state.
    }
  }

  private async request<TResult>(method: string, params: unknown, options: AcpRequestOptions = {}): Promise<TResult> {
    if (!this.transport?.isRunning || !this.capabilities) {
      throw new DevinAcpError("not-ready", "Devin ACP 尚未 ready");
    }
    try {
      return await this.transport.request<TResult>(method, params, options);
    } catch (error) {
      throw normalizeHostError(error, `ACP 请求失败：${method}`);
    }
  }

  private handleNotification(method: string, params: unknown, generation: number): void {
    if (generation !== this.generation) {
      this.emitDiagnostic({ code: "stale-event", message: "忽略来自旧 ACP host 的事件", details: { method }, generation });
      return;
    }
    if (method === "session/update") {
      const envelope = asJsonObject(params) as SessionUpdateEnvelope | null;
      const sessionId = asString(envelope?.sessionId);
      const expectedSessionId = this.pendingSessionId;
      if (sessionId && !this.sessions.has(sessionId) && sessionId !== expectedSessionId) {
        this.emitDiagnostic({ code: "stale-event", message: "忽略来自未知 session 的事件", details: { sessionId }, generation });
        return;
      }
      const redactedUpdate = redactSensitive(envelope?.update) as JsonObject | undefined;
      this.options.onUpdate?.({
        method,
        sessionId,
        update: redactedUpdate,
        params: redactSensitive(params),
        receivedAt: Date.now(),
        generation,
      });
      return;
    }
    this.options.onNotification?.(method, redactSensitive(params));
  }

  private async handleServerRequest(method: string, params: unknown, generation: number): Promise<unknown> {
    if (method !== "session/request_permission") {
      throw new DevinAcpError("capability", `Desktop 未实现 ACP request：${method}`);
    }
    const request = (asJsonObject(params) ?? {}) as PermissionRequest;
    const sessionId = asString(request.sessionId);
    if (generation !== this.generation || (sessionId && !this.sessions.has(sessionId) && sessionId !== this.pendingSessionId)) {
      return { outcome: { outcome: "cancelled" } };
    }
    if (!this.options.onPermissionRequest) return { outcome: { outcome: "cancelled" } };
    const result = await this.options.onPermissionRequest(request);
    return permissionDecision(result);
  }

  private setActiveSession(session: DevinSessionState): void {
    this.sessions.set(session.sessionId, session);
    this.activeSessionId = session.sessionId;
    this.activeSession = session;
  }

  private sessionFromResult(result: JsonObject, cwd: string, fallbackSessionId?: string): DevinSessionState {
    const sessionId = asString(result.sessionId) ?? fallbackSessionId;
    if (!sessionId) throw new DevinAcpError("protocol", "ACP session response 缺少 sessionId", result);
    const meta = asJsonObject(result._meta) ?? undefined;
    const isLocked = typeof result.isLocked === "boolean"
      ? result.isLocked
      : meta?.isLocked === true || meta?.["cognition.ai/isLocked"] === true;
    return {
      sessionId,
      cwd,
      title: asString(result.title),
      updatedAt: asString(result.updatedAt),
      modes: result.modes,
      configOptions: Array.isArray(result.configOptions) ? result.configOptions : undefined,
      ...(meta ? { _meta: meta } : {}),
      ...(isLocked ? { isLocked: true } : {}),
      raw: redactSensitive(result) as JsonObject,
    };
  }

  private requireCapabilities(): DevinCapabilities {
    if (!this.capabilities) throw new DevinAcpError("not-ready", "Devin ACP 尚未完成 initialize");
    return this.capabilities;
  }

  private requireCapability(operation: keyof SessionCapabilityMap): void {
    if (!this.hasSessionCapability(operation)) {
      throw new DevinAcpError("capability", `当前 Devin ACP 未广告 session/${operation}`);
    }
  }

  private hasSessionCapability(operation: keyof SessionCapabilityMap): boolean {
    return capabilityAdvertised(this.requireCapabilities().sessionCapabilities[operation]);
  }

  private emitState(error?: Error): void {
    this.options.onStateChange?.(this.state, error);
  }

  private emitDiagnostic(input: Omit<DevinDiagnostic, "receivedAt">): void {
    const diagnostic: DevinDiagnostic = {
      ...input,
      details: redactSensitive(input.details),
      receivedAt: Date.now(),
    };
    this.diagnostics = [...this.diagnostics.slice(-49), diagnostic];
    this.options.onDiagnostic?.(diagnostic);
  }
}

export function normalizeCapabilities(result: InitializeResult): DevinCapabilities {
  const agentCapabilities = (result.agentCapabilities ?? result.capabilities ?? {}) as AgentCapabilities;
  const sessionCapabilities = (agentCapabilities.sessionCapabilities ?? {}) as SessionCapabilityMap;
  const promptCapabilities = agentCapabilities.promptCapabilities ?? {};
  return {
    protocolVersion: typeof result.protocolVersion === "number" ? result.protocolVersion : null,
    agentInfo: asJsonObject(result.agentInfo),
    promptCapabilities,
    sessionCapabilities,
    supportsLoadSession: agentCapabilities.loadSession === true,
    authMethods: Array.isArray(result.authMethods)
      ? result.authMethods.filter((method): method is AuthMethod => Boolean(asJsonObject(method)))
      : [],
    extensions: {
      ...(asJsonObject(agentCapabilities._meta) ?? {}),
      ...(asJsonObject(result._meta) ?? {}),
    },
    raw: redactSensitive(result) as InitializeResult,
  };
}

function permissionDecision(
  result: PermissionDecision | string | null | undefined,
): DevinPermissionResult {
  if (typeof result === "string") return { outcome: { outcome: "selected", optionId: result } };
  if (result && asJsonObject(result) && asJsonObject(result)?.outcome) {
    return result as DevinPermissionResult;
  }
  return { outcome: { outcome: "cancelled" } };
}

function findAuthUrl(result: JsonObject): string | undefined {
  for (const key of ["url", "authUrl", "browserUrl"]) {
    const value = asString(result[key]);
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Ignore malformed URLs; authentication remains protocol-driven.
    }
  }
  return undefined;
}

function isSessionSummary(value: unknown): value is SessionSummary {
  return Boolean(asJsonObject(value) && typeof (value as JsonObject).sessionId === "string");
}

function isAuthRequiredError(error: DevinAcpError): boolean {
  return error.code === "auth-required" || /auth|login|credential/i.test(
    `${error.message} ${safeStringify(error.details)}`,
  );
}

function normalizeHostError(error: unknown, fallback: string): DevinAcpError {
  if (error instanceof DevinAcpError) return error;
  if (error instanceof AcpTransportError) {
    const code = error.code === "protocol" ? "protocol" : "transport";
    const detailsText = safeStringify(error.details);
    const authRequired = /auth|login|credential/i.test(`${error.message} ${detailsText}`);
    return new DevinAcpError(authRequired ? "auth-required" : code, error.message || fallback, error.details);
  }
  if (error instanceof Error) return new DevinAcpError("transport", error.message || fallback, error);
  return new DevinAcpError("transport", fallback, error);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
