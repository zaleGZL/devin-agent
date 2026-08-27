import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type {
  AgentSessionStats,
  WeixinBotEvent,
  WeixinBotStatus,
  WeixinHistoryPage,
  WeixinLoginSession,
  WeixinLoginState,
  WeixinMedia,
  WeixinMessage,
} from "../../shared/types";
import type { JsonObject, PermissionDecision, PermissionRequest, PromptContent } from "../../shared/acp-types";
import { buildAgentSnapshot } from "../runtime-adapter";
import type { AppSettings } from "../app-settings";
import { DevinAcpHost, type AcpUpdateEvent } from "../devin-acp-host";
import { MessageItemType, WeixinApi, WeixinLoginManager, type ILinkMessage } from "./protocol";
import { WeixinSecrets } from "./secrets";
import { safeFileName, WeixinStore, type WeixinOutboxPayload } from "./store";

const CLEAR_CONFIRMATION = "清除微信 Bot 数据";
const WORKSPACE_MEDIA_DIRECTORY = path.join(".devin-agent", "weixin");

export class WeixinBotService {
  readonly store: WeixinStore;
  private readonly secrets: WeixinSecrets;
  private readonly login = new WeixinLoginManager();
  private api?: WeixinApi;
  private pollAbort?: AbortController;
  private pollPromise?: Promise<void>;
  private agent?: DevinAcpHost;
  private agentSignature?: string;
  private running = false;
  private operationQueue = Promise.resolve();
  private capturingAnswer = false;
  private assistantAnswer = "";
  private contextUsage?: AgentSessionStats["contextUsage"];
  private modelId?: string;
  private modeId?: string;

  constructor(
    rootPath: string,
    private readonly appVersion: string,
    private readonly settings: AppSettings,
    private readonly emit: (event: WeixinBotEvent) => void,
  ) {
    this.store = new WeixinStore(rootPath);
    this.secrets = new WeixinSecrets(this.store.secretsPath);
  }

  async initialize(): Promise<void> {
    const state = this.store.getState();
    if (state.workspacePath) await this.validateWorkspace(state.workspacePath);
    const secret = await this.secrets.read();
    if (state.accountId && state.userId && state.baseUrl && secret.token && !state.paused) {
      await this.start().catch((error) => this.recordError(error));
    } else {
      await this.emitStatus();
    }
  }

  async getStatus(): Promise<WeixinBotStatus> {
    const state = this.store.getState();
    const secret = await this.secrets.read();
    const configured = Boolean(state.workspacePath);
    const hasLogin = Boolean(state.accountId && state.userId && state.baseUrl && secret.token);
    const connectionState = !configured
      ? "unconfigured"
      : !hasLogin
        ? (state.accountId ? "login-required" : "workspace-ready")
        : state.lastError
          ? "error"
          : this.api
            ? "online"
            : state.paused
              ? "paused"
              : "connecting";
    return {
      state: connectionState,
      ...(state.workspacePath ? { workspacePath: state.workspacePath } : {}),
      ...(state.sessionId ? { sessionId: state.sessionId } : {}),
      ...(state.accountId ? { accountId: state.accountId } : {}),
      ...(state.userId ? { boundUserId: state.userId } : {}),
      online: Boolean(this.api),
      autoLaunch: state.autoLaunch,
      running: this.running,
      ...(state.lastError ? { lastError: state.lastError } : {}),
      ...(this.contextUsage ? { contextUsage: this.contextUsage } : {}),
      mediaBytes: this.store.mediaBytes(),
      ...(this.modelId ? { modelId: this.modelId } : {}),
      ...(this.modeId ? { modeId: this.modeId } : {}),
    };
  }

  async configureWorkspace(candidate: string): Promise<void> {
    const current = this.store.getState();
    const real = await this.validateWorkspace(candidate);
    if (current.workspacePath && current.workspacePath !== real) {
      throw new Error("工作目录已锁定。更换目录前必须清除全部微信 Bot 数据");
    }
    this.store.patchState({ workspacePath: real, lastError: undefined });
    await this.emitStatus();
  }

  async startLogin(): Promise<WeixinLoginSession> {
    const state = this.store.getState();
    if (!state.workspacePath) throw new Error("请先选择微信 Bot 工作目录");
    const old = await this.secrets.read();
    const session = await this.login.start(old.token ? [old.token] : []);
    return {
      sessionId: session.id,
      qrContent: session.qrContent,
      qrImageDataUrl: await QRCode.toDataURL(session.qrContent, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
      }),
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async waitLogin(sessionId: string): Promise<WeixinLoginState> {
    const result = await this.login.poll(sessionId);
    if (result.state !== "connected") return result;
    const state = this.store.getState();
    if (state.accountId && state.accountId !== result.credentials.accountId) {
      throw new Error("该微信 Bot 与原绑定账号不一致。请先清除全部微信 Bot 数据");
    }
    if (state.userId && state.userId !== result.credentials.userId) {
      throw new Error("扫码微信身份与原绑定用户不一致。请先清除全部微信 Bot 数据");
    }
    await this.secrets.write({ token: result.credentials.token });
    this.store.patchState({
      accountId: result.credentials.accountId,
      userId: result.credentials.userId,
      baseUrl: result.credentials.baseUrl,
      paused: false,
      lastError: undefined,
    });
    await this.start();
    return { state: "connected", message: result.message };
  }

  submitVerifyCode(sessionId: string, code: string): void {
    this.login.submitVerifyCode(sessionId, code);
  }

  async start(): Promise<void> {
    if (this.api) return;
    const state = this.store.getState();
    const secret = await this.secrets.read();
    if (!state.workspacePath || !state.accountId || !state.userId || !state.baseUrl || !secret.token) {
      throw new Error("微信 Bot 尚未完成绑定");
    }
    this.api = new WeixinApi(state.baseUrl, secret.token, this.appVersion);
    this.store.patchState({ paused: false, lastError: undefined });
    await this.api.notifyStart().catch(() => undefined);
    await this.recoverDurableQueues();
    this.pollAbort = new AbortController();
    this.pollPromise = this.poll(this.pollAbort.signal);
    await this.emitStatus();
  }

  async pause(): Promise<void> {
    const api = this.api;
    this.api = undefined;
    this.pollAbort?.abort();
    await this.pollPromise?.catch(() => undefined);
    this.pollPromise = undefined;
    this.pollAbort = undefined;
    await api?.notifyStop().catch(() => undefined);
    this.store.patchState({ paused: true });
    await this.emitStatus();
  }

  async disconnect(): Promise<void> {
    await this.pause();
    await this.secrets.clear();
    this.store.patchState({ paused: false, lastError: undefined });
    await this.emitStatus();
  }

  history(query: { before?: number; limit?: number } = {}): WeixinHistoryPage {
    return this.store.history(query.before, query.limit);
  }

  async send(text: string, attachmentPaths: string[] = []): Promise<void> {
    const clean = text.trim();
    if (!clean && attachmentPaths.length === 0) return;
    const state = this.store.getState();
    if (!state.workspacePath) throw new Error("微信 Bot 尚未配置工作目录");
    for (const file of attachmentPaths) await this.validateWorkspaceFile(file, state.workspacePath);
    const message = this.addMessage({
      direction: "outbound",
      source: "desktop",
      role: "user",
      text: clean,
      media: [],
      status: "processing",
    });
    this.enqueue(async () => {
      try {
        if (state.userId) await this.sendTextReliable(state.userId, `🖥️ 桌面指令：${clean || "请查看附件"}`);
        for (const file of attachmentPaths) await this.sendMedia(file, "", "desktop");
        this.updateMessage(message.id, "sent");
        await this.runAgent(clean || "请处理随消息附带的文件。", attachmentPaths);
      } catch (error) {
        this.updateMessage(message.id, "failed");
        await this.recordError(error);
      }
    });
  }

  async abortTurn(): Promise<void> {
    await this.agent?.cancel(this.store.getState().sessionId).catch(() => undefined);
  }

  async setAutoLaunch(enabled: boolean): Promise<void> {
    this.store.patchState({ autoLaunch: enabled });
    await this.emitStatus();
  }

  async clearAllData(confirmation: string): Promise<void> {
    if (confirmation !== CLEAR_CONFIRMATION) throw new Error(`请输入“${CLEAR_CONFIRMATION}”确认`);
    const workspacePath = this.store.getState().workspacePath;
    await this.pause().catch(() => undefined);
    await this.agent?.stop().catch(() => undefined);
    this.agent = undefined;
    this.agentSignature = undefined;
    await this.secrets.clear();
    await this.store.clearAll();
    if (workspacePath) {
      await fs.rm(path.join(workspacePath, WORKSPACE_MEDIA_DIRECTORY), { recursive: true, force: true });
    }
    this.contextUsage = undefined;
    this.modelId = undefined;
    this.modeId = undefined;
    this.emit({ type: "history-reset" });
    await this.emitStatus();
  }

  async shutdown(): Promise<void> {
    await this.pause().catch(() => undefined);
    await this.agent?.stop().catch(() => undefined);
    this.store.close();
  }

  async stopAgentRuntime(): Promise<void> {
    await this.agent?.stop().catch(() => undefined);
    this.agent = undefined;
    this.agentSignature = undefined;
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted && this.api) {
      const state = this.store.getState();
      try {
        const response = await this.api.getUpdates(state.updatesBuffer, signal);
        if (signal.aborted) break;
        if (response.errcode === -14 || response.ret === -14) throw new Error("微信登录已失效，请重新绑定");
        if (response.ret && response.ret !== 0) throw new Error(`微信同步失败: ${response.errmsg ?? response.ret}`);
        for (const message of response.msgs ?? []) await this.acceptInbound(message);
        if (response.get_updates_buf !== undefined) {
          this.store.patchState({ updatesBuffer: response.get_updates_buf });
        }
        failures = 0;
      } catch (error) {
        if (signal.aborted) break;
        failures += 1;
        if (error instanceof Error && /登录已失效/.test(error.message)) {
          this.api = undefined;
          this.store.patchState({ lastError: error.message, paused: true });
          await this.emitStatus();
          break;
        }
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5)) + Math.floor(Math.random() * 500);
        await abortableDelay(delay, signal);
      }
    }
  }

  private async acceptInbound(raw: ILinkMessage, recoveredPlatformId?: string): Promise<void> {
    const state = this.store.getState();
    if (!state.userId || raw.from_user_id !== state.userId || raw.message_type !== 1) return;
    const platformId = recoveredPlatformId ?? String(raw.message_id ?? raw.client_id ?? randomUUID());
    if (!recoveredPlatformId && !this.store.persistInbox(platformId, raw)) return;
    const normalized = await this.normalizeInbound(raw);
    const message = this.addMessage({
      platformId,
      direction: "inbound",
      source: "weixin",
      role: "user",
      text: normalized.text,
      media: normalized.media,
      status: "processing",
    });
    const secret = await this.secrets.read();
    await this.secrets.write({ ...secret, ...(raw.context_token ? { contextToken: raw.context_token } : {}) });
    this.enqueue(async () => {
      try {
        this.updateMessage(message.id, "sent");
        await this.runAgent(
          normalized.prompt,
          normalized.media.map((item) => item.localPath).filter((value): value is string => Boolean(value)),
        );
        this.store.completeInbox(platformId);
      } catch (error) {
        this.updateMessage(message.id, "failed");
        await this.recordError(error);
      }
    });
  }

  private async normalizeInbound(raw: ILinkMessage): Promise<{ text: string; prompt: string; media: WeixinMedia[] }> {
    const texts: string[] = [];
    const media: WeixinMedia[] = [];
    for (const item of raw.item_list ?? []) {
      if (item.ref_msg?.title) texts.push(`> 引用：${item.ref_msg.title}`);
      if (item.type === MessageItemType.TEXT && item.text_item?.text) texts.push(item.text_item.text);
      if (item.type === MessageItemType.VOICE && item.voice_item?.text) texts.push(`[语音转写] ${item.voice_item.text}`);
      if (item.type !== MessageItemType.TEXT && this.api) {
        const downloaded = await this.api.download(item).catch(() => undefined);
        if (downloaded) {
          await this.store.saveMedia(downloaded.buffer, downloaded.name, "inbound");
          const localPath = await this.saveWorkspaceMedia(downloaded.buffer, downloaded.name);
          media.push({
            kind: downloaded.kind,
            name: downloaded.name,
            mimeType: downloaded.mimeType,
            size: downloaded.buffer.length,
            localPath,
          });
        }
      }
    }
    const text = texts.join("\n").trim() || (media.length ? "发送了附件" : "收到一条空消息");
    const attachmentText = media.length
      ? `\n\n本条微信消息的工作目录附件：\n${media.map((item) => `- ${item.kind}: ${item.localPath}`).join("\n")}`
      : "";
    return { text, prompt: `${text}${attachmentText}`, media };
  }

  private async runAgent(prompt: string, attachmentPaths: string[]): Promise<void> {
    await this.ensureAgent();
    const state = this.store.getState();
    const sessionId = state.sessionId;
    if (!this.agent || !sessionId) throw new Error("微信 Bot 的 Devin 会话不可用");
    this.running = true;
    this.capturingAnswer = true;
    this.assistantAnswer = "";
    await this.emitStatus();
    const secret = await this.secrets.read();
    const ticket = this.api && state.userId
      ? await this.api.getTypingTicket(state.userId, secret.contextToken).catch(() => undefined)
      : undefined;
    if (ticket && this.api && state.userId) {
      await this.api.sendTyping(state.userId, ticket, true).catch(() => undefined);
    }
    try {
      const content = await this.promptContent(prompt, attachmentPaths);
      await this.agent.prompt(content, sessionId);
      const answer = this.assistantAnswer.trim();
      if (!answer) throw new Error("Devin ACP 未返回可发送的文本回复");
      const clientId = `devin-agent-${randomUUID()}`;
      this.addMessage({
        platformId: clientId,
        direction: "outbound",
        source: "agent",
        role: "assistant",
        text: answer,
        media: [],
        status: "pending",
      });
      if (state.userId) await this.sendTextReliable(state.userId, answer, clientId);
      this.store.patchState({ lastError: undefined });
    } finally {
      this.capturingAnswer = false;
      this.assistantAnswer = "";
      if (ticket && this.api && state.userId) {
        await this.api.sendTyping(state.userId, ticket, false).catch(() => undefined);
      }
      this.running = false;
      await this.emitStatus();
    }
  }

  private async ensureAgent(): Promise<void> {
    const state = this.store.getState();
    if (!state.workspacePath) throw new Error("微信 Bot 尚未配置工作目录");
    const [binaryPath, requestedModel, requestedMode] = await Promise.all([
      this.settings.getDevinCliPath(),
      this.settings.getNewSessionModelId(),
      this.settings.getPreferredModeId(),
    ]);
    const signature = JSON.stringify([binaryPath, requestedModel, requestedMode, state.workspacePath]);
    if (this.agent && this.agentSignature === signature) return;
    await this.agent?.stop().catch(() => undefined);
    const host = new DevinAcpHost({
      ...(binaryPath ? { binaryPath } : {}),
      cwd: state.workspacePath,
      clientName: "devin-agent-weixin",
      clientVersion: this.appVersion,
      clientFeatures: { elicitationForm: false, elicitationUrl: false, chains: false },
      onUpdate: (event) => this.handleAgentUpdate(event),
      onPermissionRequest: (request) => permissionDecisionForBot(request),
      onElicitationRequest: () => ({ action: "cancel" }),
      onStateChange: (nextState, error) => {
        if (nextState === "error" && error) this.store.patchState({ lastError: safeError(error) });
      },
    });
    const capabilities = await host.start();
    const session = state.sessionId
      ? await host.loadSession(state.sessionId, { cwd: state.workspacePath })
      : await host.newSession(state.workspacePath);
    if (state.sessionId && session.sessionId !== state.sessionId) {
      await host.stop();
      throw new Error("微信 Bot 固定会话身份发生变化，已停止以保护历史");
    }
    const snapshot = buildAgentSnapshot(capabilities, session, requestedModel ?? undefined);
    if (requestedModel && snapshot.models.some((model) => model.id === requestedModel)) {
      await host.setConfigOption("model", requestedModel, session.sessionId);
      this.modelId = requestedModel;
    } else {
      const currentModel = snapshot.state.model as { id?: string } | undefined;
      this.modelId = currentModel?.id;
    }
    if (requestedMode && snapshot.modes?.some((mode) => mode.id === requestedMode)) {
      await host.setMode(requestedMode, session.sessionId);
      this.modeId = requestedMode;
    } else {
      this.modeId = typeof snapshot.state.modeId === "string" ? snapshot.state.modeId : undefined;
    }
    this.agent = host;
    this.agentSignature = signature;
    this.store.patchState({ sessionId: session.sessionId });
    await this.emitStatus();
  }

  private handleAgentUpdate(event: AcpUpdateEvent): void {
    const update = event.update;
    if (!update) return;
    if (update.sessionUpdate === "usage_update") {
      const contextWindow = finiteNumber(update.contextWindow ?? update.context_window ?? update.size);
      const tokens = finiteNumber(update.contextTokens ?? update.context_tokens ?? update.context ?? update.used);
      const percent = finiteNumber(update.percent ?? update.percentage)
        ?? (contextWindow && tokens !== undefined ? tokens / contextWindow * 100 : undefined);
      if (contextWindow !== undefined) {
        this.contextUsage = {
          tokens: tokens ?? null,
          contextWindow,
          percent: percent ?? null,
        };
      }
    }
    if (update.sessionUpdate === "agent_thought_chunk") {
      const text = extractText(update.content ?? update.thought ?? update.text);
      if (text) {
        const ph = thoughtPhase(update);
        this.emit({ type: "thought", text, phase: ph });
      }
    }
    if (!this.capturingAnswer || update.sessionUpdate !== "agent_message_chunk") return;
    this.assistantAnswer += extractText(update.content ?? update.message);
  }

  private async promptContent(prompt: string, attachmentPaths: string[]): Promise<PromptContent[]> {
    const paths = attachmentPaths.map((file) => `- ${file}`).join("\n");
    const text = [
      "你正在通过 Devin Agent 的微信 Bot 固定会话回复用户。请给出适合直接发送到微信的最终答复；不要依赖桌面端专属 UI。",
      prompt,
      paths ? `本次可用附件：\n${paths}` : "",
    ].filter(Boolean).join("\n\n");
    const content: PromptContent[] = [{ type: "text", text }];
    if (this.agent?.negotiatedCapabilities?.promptCapabilities.image !== true) return content;
    for (const file of attachmentPaths.slice(0, 5)) {
      const mimeType = mimeForPath(file);
      if (!mimeType.startsWith("image/")) continue;
      content.push({ type: "image", data: (await fs.readFile(file)).toString("base64"), mimeType });
    }
    return content;
  }

  private async sendMedia(file: string, caption: string, source: "agent" | "desktop" = "agent"): Promise<boolean> {
    const state = this.store.getState();
    if (!state.userId || !state.workspacePath) throw new Error("微信 Bot 尚未完成绑定");
    const real = await this.validateWorkspaceFile(file, state.workspacePath);
    if (caption) await this.sendTextReliable(state.userId, caption);
    const buffer = await fs.readFile(real);
    const localPath = await this.store.saveMedia(buffer, path.basename(real), "outbound");
    const clientId = `devin-agent-${randomUUID()}`;
    const mimeType = mimeForPath(real);
    const media: WeixinMedia = {
      kind: mediaKind(mimeType),
      name: path.basename(real),
      mimeType,
      size: buffer.length,
      localPath,
    };
    this.addMessage({
      platformId: clientId,
      direction: "outbound",
      source,
      role: source === "desktop" ? "user" : "assistant",
      text: caption,
      media: [media],
      status: "pending",
    });
    const payload: WeixinOutboxPayload = { kind: "media", to: state.userId, localPath };
    this.store.enqueueOutbox(clientId, payload);
    return this.deliverOutbox(clientId, payload);
  }

  private async sendTextReliable(to: string, text: string, existingClientId?: string): Promise<boolean> {
    const clientId = existingClientId ?? `devin-agent-${randomUUID()}`;
    const payload: WeixinOutboxPayload = { kind: "text", to, text };
    this.store.enqueueOutbox(clientId, payload);
    return this.deliverOutbox(clientId, payload);
  }

  private async deliverOutbox(clientId: string, payload: WeixinOutboxPayload): Promise<boolean> {
    if (!this.api) return false;
    try {
      const secret = await this.secrets.read();
      if (payload.kind === "text") {
        try {
          await this.api.sendText(payload.to, payload.text, secret.contextToken, clientId);
        } catch (error) {
          if (!/-2\b|context.?token/i.test(errorMessage(error))) throw error;
          await this.api.getTypingTicket(payload.to).catch(() => undefined);
          await this.api.sendText(payload.to, payload.text, undefined, clientId);
        }
      } else {
        const uploaded = await this.api.upload(payload.localPath, payload.to);
        await this.api.sendItem(payload.to, uploaded.item, secret.contextToken, clientId);
      }
      this.store.completeOutbox(clientId);
      const message = this.store.updateMessageByPlatformId(clientId, "sent");
      if (message) this.emit({ type: "message", message });
      return true;
    } catch (error) {
      this.store.failOutbox(clientId, safeError(error));
      return false;
    }
  }

  private async recoverDurableQueues(): Promise<void> {
    if (!this.api) return;
    for (const entry of this.store.pendingOutbox()) {
      await this.deliverOutbox(entry.clientId, entry.payload);
    }
    for (const entry of this.store.pendingInbox()) {
      if (isRecord(entry.payload)) await this.acceptInbound(entry.payload as ILinkMessage, entry.platformId);
    }
  }

  private addMessage(input: Omit<WeixinMessage, "id" | "createdAt">): WeixinMessage {
    const message = this.store.addMessage(input);
    this.emit({ type: "message", message });
    return message;
  }

  private updateMessage(id: number, status: WeixinMessage["status"]): void {
    const message = this.store.updateMessage(id, status);
    if (message) this.emit({ type: "message", message });
  }

  private enqueue(task: () => Promise<void>): void {
    this.operationQueue = this.operationQueue.then(task, task);
  }

  private async emitStatus(): Promise<void> {
    this.emit({ type: "status", status: await this.getStatus() });
  }

  private async recordError(error: unknown): Promise<void> {
    const message = safeError(error);
    this.store.patchState({ lastError: message });
    this.addMessage({
      direction: "outbound",
      source: "system",
      role: "system",
      text: message,
      media: [],
      status: "failed",
    });
    await this.emitStatus();
  }

  private async validateWorkspace(candidate: string): Promise<string> {
    const real = await fs.realpath(path.resolve(candidate));
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) throw new Error("工作目录必须是文件夹");
    return real;
  }

  private async validateWorkspaceFile(candidate: string, workspace: string): Promise<string> {
    const root = await fs.realpath(workspace);
    const real = await fs.realpath(path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate));
    const relative = path.relative(root, real);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("文件不在微信 Bot 工作目录内");
    }
    const stat = await fs.stat(real);
    if (!stat.isFile()) throw new Error("附件必须是文件");
    return real;
  }

  private async saveWorkspaceMedia(buffer: Buffer, name: string): Promise<string> {
    const workspacePath = this.store.getState().workspacePath;
    if (!workspacePath) throw new Error("微信 Bot 尚未配置工作目录");
    const directory = path.join(workspacePath, WORKSPACE_MEDIA_DIRECTORY, "inbound", new Date().toISOString().slice(0, 10));
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const filePath = path.join(directory, `${Date.now()}-${safeFileName(name)}`);
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    return filePath;
  }
}

export function permissionDecisionForBot(request: PermissionRequest): PermissionDecision {
  const options = Array.isArray(request.options) ? request.options : [];
  const normalized = options.flatMap((option) => {
    const optionId = stringValue(option.optionId ?? option.id);
    if (!optionId) return [];
    const text = [optionId, option.name, option.label, option.description]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return [{ optionId, text }];
  });
  const rejected = /(deny|reject|cancel|block|禁止|拒绝|取消)/i;
  const allowed = /(allow|approve|permit|accept|允许|批准|同意)/i;
  const once = /(once|this time|本次|一次)/i;
  const selected = normalized.find((option) => allowed.test(option.text) && once.test(option.text) && !rejected.test(option.text))
    ?? normalized.find((option) => allowed.test(option.text) && !rejected.test(option.text));
  return selected
    ? { outcome: { outcome: "selected", optionId: selected.optionId } }
    : { outcome: { outcome: "cancelled" } };
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.text === "string") return value.text;
  if (!Array.isArray(value)) return "";
  return value
    .filter(isRecord)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("");
}

function thoughtPhase(update: JsonObject): "start" | "update" | "end" {
  const raw = update.phase ?? update.status;
  if (typeof raw !== "string") return "update";
  const value = raw.toLowerCase();
  if (value === "start" || value === "started") return "start";
  if (value === "end" || value === "ended" || value === "complete" || value === "completed") return "end";
  return "update";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mimeForPath(file: string): string {
  const extension = path.extname(file).toLowerCase();
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".wav": "audio/wav",
    ".silk": "audio/silk",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function mediaKind(mimeType: string): WeixinMedia["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "voice";
  return "file";
}

function safeError(error: unknown): string {
  return errorMessage(error)
    .replace(/(bearer\s+|token|secret|password|api[_-]?key)[=:]?\s*\S+/gi, "$1 [REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
