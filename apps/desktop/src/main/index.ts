import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  shell,
  Tray,
} from "electron";
import { discoverDevinBinary, validateDevinBinary } from "./devin-discovery";
import { createDevinWorkspaceUrl } from "./devin-desktop";
import { listWorkspaceChanges, readWorkspaceDiff } from "./git-changes";
import { checkDevinCliUpdate, installDevinCliUpdate, type ManifestFetcher } from "./devin-update";
import { MentionIndex } from "./mention-index";
import { serializeMentionPrompt } from "./mention-prompt";
import { SkillIndex } from "./skill-index";
import { AppSettings } from "./app-settings";
import { RecentWorkspaces } from "./recent-workspaces";
import { InteractionBroker } from "./interaction-broker";
import { ElicitationUrlRegistry } from "./elicitation-url-registry";
import {
  archiveSession,
  configureSessionIndex,
  listSessions,
  renameSession,
  reorderSessions,
  removeSessionSummary,
  setSessionPinned,
  unarchiveSession,
  upsertSessionSummary,
} from "./session-index";
import {
  buildAgentSnapshot,
  buildCapabilityProbeSnapshot,
  isRuntimePromptRunning,
  mapRuntimeSessionSummary,
  resolveRuntimeCommandSessionId,
  resolveRuntimeSessionOpenAction,
} from "./runtime-adapter";
import {
  isPathInside,
  isSafeExternalUrl,
  SECURE_RENDERER_WEB_PREFERENCES,
  validateIpcRecord,
  validateIpcString,
} from "./desktop-security";
import type {
  AgentEvent,
  AgentSnapshot,
  AgentStartOptions,
  AuthUiEvent,
  ColorSchemePreference,
  FilePreview,
  FilePreviewKind,
  DevinCliUpdateStatus,
  LanguagePreference,
  ProviderStatus,
  SessionSummary,
  UserProfile,
} from "../shared/types";
import { parseMentionSearchRequest, parseSkillListRequest } from "../shared/mentions";
import { MARKDOWN_EXPORT_MAX_CHARACTERS, parseMarkdownExportRequest } from "../shared/markdown-export";
import { capabilityAdvertised, type JsonObject, type PromptContent } from "../shared/acp-types";
import {
  normalizePermissionOptions,
  parseElicitationFormSchema,
  parseSafeElicitationUrl,
  validateElicitationValues,
  type DesktopInteractionRequest,
  type DesktopInteractionResponse,
} from "../shared/interactions";
import {
  editableCommandFromPermission,
  permissionDecisionFromInteraction,
  permissionToolCallId,
  revisedCommandFromResult,
} from "./permission-interactions";
import { beginCommandRevision, completeCommandRevision, rollbackCommandRevision } from "./command-revision-state";
import { WeixinBotService } from "./weixin/service";

/**
 * The ACP implementation is owned by the runtime layer. The shell only relies
 * on this narrow structural contract so it can be tested without a CLI.
 */
type RuntimeHost = {
  start?(options: AgentStartOptions): Promise<AgentSnapshot>;
  stop?(): Promise<void>;
  request?<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T>;
  command?<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T>;
  respondToUi?(id: string, response: Record<string, unknown>): Promise<{ pending?: boolean } | void>;
  renameSession?(id: string, title: string): Promise<SessionSummary | undefined>;
  authenticate?(): Promise<boolean>;
  logout?(): Promise<void>;
  listSessions?(cwd?: string): Promise<SessionSummary[]>;
  deleteSession?(id: string): Promise<void>;
  onEvent?(listener: (event: AgentEvent) => void): () => void;
  onError?(listener: (error: string) => void): () => void;
};

let mainWindow: BrowserWindow | undefined;
let agentHost: RuntimeHost | undefined;
let recentWorkspaces: RecentWorkspaces;
let appSettings: AppSettings;
let weixinBot: WeixinBotService | undefined;
let tray: Tray | undefined;
let quitting = false;
let devinCliUpdatePromise: Promise<DevinCliUpdateStatus> | undefined;
const sessionWindows = new Map<string, BrowserWindow>();
const auxiliaryWindowIds = new Set<number>();
const rendererSessionIds = new Map<number, string>();
const rendererCwds = new Map<number, string>();
const rendererWorkspaces = new Map<number, string>();
const mentionIndex = new MentionIndex();
const skillIndex = new SkillIndex();
const mentionSearchControllers = new Map<number, AbortController>();
const previewFiles = new Map<string, { filePath: string; rootPath: string }>();
let activePreviewId: string | undefined;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
// Electron's native macOS icon loader does not reliably accept SVG paths.
// Reuse the verified PNG asset in development so a cosmetic icon failure can
// never abort BrowserWindow construction.
const developmentIconPath = path.join(currentDirectory, "../../build/icon.png");
const trayIconPath = app.isPackaged ? path.join(app.getAppPath(), "build/icon.png") : developmentIconPath;
const legacyUserDataPath = app.getPath("userData");
const userDataOverride = process.env.DEVIN_AGENT_USER_DATA;
const stableUserDataPath = userDataOverride
  ? path.resolve(userDataOverride)
  : path.join(app.getPath("appData"), "Devin Agent");
const appSettingsFile = path.join(stableUserDataPath, "app-settings.json");
const sessionIndexFile = path.join(stableUserDataPath, "session-index.json");
const authPrompts = new Map<string, { resolve(value: string): void; reject(error: Error): void }>();
const interactionBroker = new InteractionBroker();
const urlInteractionIds = new ElicitationUrlRegistry();

function openDesktopInteraction(request: DesktopInteractionRequest): Promise<DesktopInteractionResponse> {
  const targetWindow = request.sessionId ? windowForSession(request.sessionId) : undefined;
  const owner = targetWindow ?? BrowserWindow.getFocusedWindow() ?? mainWindow;
  const handle = interactionBroker.open<DesktopInteractionRequest, DesktopInteractionResponse>(request, {
    id: request.id,
    kind: request.kind,
    generation: request.generation,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    ...(request.toolCallId ? { toolCallId: request.toolCallId } : {}),
    ...(request.requestId !== undefined ? { requestId: request.requestId } : {}),
    ...(owner ? { ownerId: owner.webContents.id } : {}),
    timeoutMs: 120_000,
    cancelResult: { action: "cancel" },
  });
  if (request.kind === "elicitation-url") urlInteractionIds.register(request.elicitationId, request.id);
  owner?.webContents.send("agent:event", { type: "interaction_request", request });
  void handle.result.finally(() => {
    if (request.kind === "elicitation-url") urlInteractionIds.unregister(request.elicitationId, request.id);
    if (owner && !owner.isDestroyed()) owner.webContents.send("agent:event", { type: "interaction_closed", id: request.id });
  });
  return handle.result;
}

function extensionEnabled(host: { hasExtension?(key: string): boolean }, key: string): boolean {
  try { return host.hasExtension?.(key) === true; } catch { return false; }
}

function sendInteractionRequest(ownerId: number | undefined, request: DesktopInteractionRequest): void {
  const owner = ownerId === undefined ? undefined : windowForSender(ownerId);
  owner?.webContents.send("agent:event", { type: "interaction_request", request });
}

async function respondToDesktopInteraction(
  id: string,
  request: DesktopInteractionRequest,
  data: Record<string, unknown>,
): Promise<{ pending?: boolean } | void> {
  const pending = interactionBroker.get(id);
  if (!pending || pending.generation !== request.generation) return;
  const action = typeof data.action === "string" ? data.action : "cancel";

  if (request.kind === "permission") {
    if (action === "revise") {
      const instruction = expectString(data.instruction, "revision instruction", 4_000).trim();
      const revision = data.revision;
      if (!instruction || !Number.isSafeInteger(revision) || revision !== (request.commandRevision?.revision ?? -1) + 1 || !request.sessionId || !request.commandRevision) {
        throw new Error("Invalid command revision request");
      }
      const inFlight = interactionBroker.updateRequest<DesktopInteractionRequest>(id, (current) => current.kind === "permission"
        ? beginCommandRevision(current, revision as number) ?? current
        : current);
      if (inFlight) sendInteractionRequest(pending.ownerId, inFlight);
      try {
        const result = await agentHost?.command?.("revise_command", {
          sessionId: request.sessionId,
          command: request.commandRevision.command,
          instruction,
        });
        const command = revisedCommandFromResult(result);
        if (!command) throw new Error("Devin returned an invalid revised command");
        const current = interactionBroker.get(id)?.request as DesktopInteractionRequest | undefined;
        if (!current || current.kind !== "permission" || current.commandRevision?.revision !== revision) return { pending: true };
        const updated = interactionBroker.updateRequest<DesktopInteractionRequest>(id, (value) => value.kind === "permission"
          ? completeCommandRevision(value, revision as number, command) ?? value
          : value);
        if (updated) sendInteractionRequest(pending.ownerId, updated);
        return { pending: true };
      } catch (error) {
        const rolledBack = interactionBroker.updateRequest<DesktopInteractionRequest>(id, (current) => current.kind === "permission"
          ? rollbackCommandRevision(current, revision as number)
          : current);
        if (rolledBack) sendInteractionRequest(pending.ownerId, rolledBack);
        throw error;
      }
    }
    if (action === "select") {
      const optionId = expectString(data.optionId, "permission option", 200);
      const updatedCommand = typeof data.updatedCommand === "string" && request.editableCommand
        ? expectString(data.updatedCommand, "updated command", 100_000).trim()
        : undefined;
      const response: DesktopInteractionResponse = {
        action: "select",
        optionId,
        ...(updatedCommand ? { updatedCommand } : {}),
      };
      interactionBroker.settle(id, response, request.generation);
      return;
    }
    interactionBroker.settle(id, { action: "cancel" }, request.generation);
    return;
  }

  if (request.kind === "elicitation-form") {
    if (action === "accept") {
      const raw = expectRecord(data.content, "elicitation content");
      const validated = validateElicitationValues(request.form, raw);
      if (!validated.ok) throw new Error("Elicitation values do not satisfy the requested schema");
      interactionBroker.settle(id, { action: "accept", content: validated.content }, request.generation);
      return;
    }
    interactionBroker.settle(id, { action: action === "decline" ? "decline" : "cancel" }, request.generation);
    return;
  }

  if (action === "open") {
    const safe = parseSafeElicitationUrl(request.url);
    if (!safe || safe.url !== request.url) throw new Error("Unsafe elicitation URL");
    await shell.openExternal(request.url);
    return { pending: true };
  }
  interactionBroker.settle(id, { action: action === "decline" ? "decline" : "cancel" }, request.generation);
}

protocol.registerSchemesAsPrivileged([{
  scheme: "devin-preview",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  const target = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!target) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
});

app.setName("Devin Agent");
fs.mkdirSync(stableUserDataPath, { recursive: true, mode: 0o700 });
app.setPath("userData", stableUserDataPath);
if (userDataOverride) {
  const logs = path.join(stableUserDataPath, "logs");
  fs.mkdirSync(logs, { recursive: true, mode: 0o700 });
  app.setAppLogsPath(logs);
} else {
  app.setAppLogsPath();
}

async function createRuntimeHost(): Promise<RuntimeHost | undefined> {
  try {
    // Loaded lazily to keep Electron shell tests independent from CLI runtime.
    const runtime = await import("./devin-acp-host");
    const Constructor = (runtime as unknown as { DevinAcpHost?: new (options: any) => any }).DevinAcpHost;
    if (!Constructor) return undefined;
    let latestSnapshot: AgentSnapshot | undefined;
    const advertisedCommands = new Map<string, Set<string>>();
    const advertisedCommandMetadata = new Map<string, Record<string, unknown>[]>();
    const configuredPath = await appSettings.getDevinCliPath();
    const host = new Constructor({
      ...(configuredPath ? { binaryPath: configuredPath } : {}),
      onUpdate: (event: { method: string; sessionId?: string; update?: unknown; params?: unknown; receivedAt?: number }) => {
        if (event.update && typeof event.update === "object") {
          const update = event.update as Record<string, unknown>;
          if (update.sessionUpdate === "available_commands_update" && Array.isArray(update.availableCommands)) {
            const commands = new Set(update.availableCommands.flatMap((command) => {
              if (typeof command === "string") return [command.replace(/^\//, "").toLowerCase()];
              if (!command || typeof command !== "object") return [];
              const name = (command as Record<string, unknown>).name ?? (command as Record<string, unknown>).command;
              return typeof name === "string" ? [name.replace(/^\//, "").toLowerCase()] : [];
            }));
            if (event.sessionId) {
              advertisedCommands.set(event.sessionId, commands);
              advertisedCommandMetadata.set(event.sessionId, update.availableCommands.flatMap((command) => {
                if (typeof command === "string") return [{ name: command }];
                return command && typeof command === "object" ? [command as Record<string, unknown>] : [];
              }));
            }
          }
        }
        broadcastToRenderers("agent:event", {
          type: "acp_update",
          sessionId: event.sessionId,
          update: event.update,
          params: event.params,
          timestamp: event.receivedAt,
        });
      },
      onStateChange: (state: string, error?: Error) => {
        if (state === "error" || state === "stopping" || state === "closed") interactionBroker.cancelAll();
        broadcastToRenderers("agent:event", { type: "agent_state", state, ...(error ? { error: safeError(error) } : {}) });
      },
      onDiagnostic: (diagnostic: unknown) => broadcastToRenderers("agent:event", { type: "agent_diagnostic", diagnostic }),
      openExternal: (url: string) => shell.openExternal(url),
      onPermissionRequest: async (request: unknown, context: { generation: number; rpcRequestId: string | number | null }) => {
        const requestRecord = request && typeof request === "object" ? request as Record<string, unknown> : {};
        const id = randomUUID();
        const options = normalizePermissionOptions(Array.isArray(requestRecord.options) ? requestRecord.options : undefined);
        const requestSessionId = typeof requestRecord.sessionId === "string" ? requestRecord.sessionId : undefined;
        const editableCommand = extensionEnabled(raw, "cognition.ai/editableCommands") ? editableCommandFromPermission(requestRecord) : undefined;
        const commandRevision = extensionEnabled(raw, "cognition.ai/commandRevision") && editableCommand
          ? { command: editableCommand.command, revision: 0 }
          : undefined;
        const response = await openDesktopInteraction({
          kind: "permission",
          id,
          generation: context.generation,
          ...(requestSessionId ? { sessionId: requestSessionId } : {}),
          ...(permissionToolCallId(requestRecord) ? { toolCallId: permissionToolCallId(requestRecord) } : {}),
          requestId: context.rpcRequestId,
          title: "Devin needs permission",
          message: "Review the request and choose an action.",
          options,
          ...(editableCommand ? { editableCommand } : {}),
          ...(commandRevision ? { commandRevision } : {}),
          raw: requestRecord,
        });
        return permissionDecisionFromInteraction(response, options, editableCommand?.command);
      },
      onElicitationRequest: async (request: unknown, context: { generation: number; rpcRequestId: string | number | null }) => {
        const record = request && typeof request === "object" ? request as Record<string, unknown> : {};
        const sessionId = typeof record.sessionId === "string" ? record.sessionId : undefined;
        const toolCallId = typeof record.toolCallId === "string" ? record.toolCallId : undefined;
        const requestId = typeof record.requestId === "string" || typeof record.requestId === "number" || record.requestId === null ? record.requestId : undefined;
        const common = {
          id: randomUUID(),
          generation: context.generation,
          ...(sessionId ? { sessionId } : {}),
          ...(toolCallId ? { toolCallId } : {}),
          ...(requestId !== undefined ? { requestId } : {}),
          message: typeof record.message === "string" ? record.message : "Devin requests additional information.",
        };
        if (record.mode === "form") {
          const parsed = parseElicitationFormSchema(record.requestedSchema as JsonObject | undefined);
          if (!parsed.ok) return { action: "cancel" };
          const response = await openDesktopInteraction({ kind: "elicitation-form", ...common, form: parsed.form });
          return response.action === "accept" ? { action: "accept", content: response.content ?? {} } : response.action === "decline" ? { action: "decline" } : { action: "cancel" };
        }
        if (record.mode === "url" && typeof record.elicitationId === "string" && typeof record.url === "string") {
          const safe = parseSafeElicitationUrl(record.url);
          if (!safe) return { action: "cancel" };
          const response = await openDesktopInteraction({ kind: "elicitation-url", ...common, elicitationId: record.elicitationId, ...safe });
          return response.action === "accept" ? { action: "accept" } : response.action === "decline" ? { action: "decline" } : { action: "cancel" };
        }
        return { action: "cancel" };
      },
      onElicitationComplete: (notification: { elicitationId: string }, context: { generation: number }) => {
        const interactionId = urlInteractionIds.get(notification.elicitationId);
        if (interactionId) interactionBroker.settle(interactionId, { action: "accept" }, context.generation);
      },
    }) as any;
    const raw = host as any;
    let pendingRuntimeStart: { key: string; promise: Promise<AgentSnapshot> } | undefined;
    const startRuntime = async (options: AgentStartOptions): Promise<AgentSnapshot> => {
      const capabilities = await raw.start?.();
      const targetSessionId = options.sessionId ?? options.sessionPath;
      if (options.capabilitiesOnly && targetSessionId) {
        throw new Error("Capability discovery cannot load an existing Devin session");
      }
      if (options.capabilitiesOnly && (
        !capabilityAdvertised(capabilities?.sessionCapabilities?.delete)
        || typeof raw.deleteSession !== "function"
      )) {
        throw new Error("Current Devin ACP cannot safely discover new-task capabilities without retaining an empty session");
      }
      const cwd = options.cwd ?? raw.session?.cwd;
      let session: Record<string, unknown> | undefined;
      if (targetSessionId) {
        if (!cwd) throw new Error("A workspace path is required to load this Devin session");
        const action = resolveRuntimeSessionOpenAction(targetSessionId, raw.sessionId, Boolean(raw.session), options.replaySession);
        session = action === "switch"
          ? await raw.switchSession?.(targetSessionId, { cwd, additionalDirectories: options.additionalDirectories })
          : action === "reuse"
            ? raw.session
            : await raw.loadSession?.(targetSessionId, { cwd, additionalDirectories: options.additionalDirectories });
      } else {
        if (!cwd) throw new Error("Open a workspace before creating a Devin session");
        session = await raw.newSession?.(cwd, { additionalDirectories: options.additionalDirectories });
      }
      if (!session) throw new Error("Devin ACP did not return a session");
      const snapshot = options.capabilitiesOnly
        ? await buildCapabilityProbeSnapshot(
          capabilities ?? raw.negotiatedCapabilities,
          session,
          (sessionId) => raw.deleteSession(sessionId, session),
          options.model || undefined,
        )
        : buildAgentSnapshot(capabilities ?? raw.negotiatedCapabilities, session, options.model || undefined);
      latestSnapshot = snapshot;
      latestSnapshot.state.isStreaming = options.capabilitiesOnly ? false : raw.isPromptRunning === true;
      return latestSnapshot;
    };
    return {
      start(options) {
        const key = JSON.stringify([options.cwd, options.sessionId, options.sessionPath, options.additionalDirectories, options.model, options.replaySession, options.capabilitiesOnly]);
        if (pendingRuntimeStart?.key === key) return pendingRuntimeStart.promise;
        const previous = pendingRuntimeStart?.promise.catch(() => undefined);
        const promise = (async () => {
          if (previous) await previous;
          return startRuntime(options);
        })();
        const pending = { key, promise };
        pendingRuntimeStart = pending;
        const clear = () => { if (pendingRuntimeStart === pending) pendingRuntimeStart = undefined; };
        void promise.then(clear, clear);
        return promise;
      },
      async stop() {
        interactionBroker.cancelAll();
        await raw.stop?.();
      },
      async command<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T> {
        const payload = data ?? {};
        if (type === "prompt" || type === "follow_up") {
          const sessionId = resolveRuntimeCommandSessionId(payload, raw.sessionId);
          if (!sessionId) throw new Error("No active Devin session");
          let prompt = typeof payload.message === "string" ? payload.message : typeof payload.prompt === "string" ? payload.prompt : "";
          const images = Array.isArray(payload.images) ? payload.images : [];
          let content: PromptContent[] = [{ type: "text", text: prompt }];
          if (payload.mentions !== undefined) {
            const serialized = await serializeMentionPrompt({
              workspaceRoot: typeof payload.workspacePath === "string" ? payload.workspacePath : undefined,
              mentions: payload.mentions,
              text: prompt,
              embeddedContext: raw.negotiatedCapabilities?.promptCapabilities?.embeddedContext === true,
              availableSkills: skillIndex.getSession(sessionId) ?? [],
            });
            prompt = serialized.text;
            content = serialized.content;
          }
          content.push(...images.filter((image): image is Record<string, unknown> => Boolean(image && typeof image === "object")));
          if (type === "follow_up") {
            await raw.cancel?.(sessionId);
            await waitUntil(
              () => !isRuntimePromptRunning(raw.runningSessionIds, sessionId, raw.sessionId, raw.isPromptRunning),
              5_000,
            );
          }
          const existingSummary = (await listSessions()).find((session) => session.id === sessionId);
          if (existingSummary) {
            const firstPrompt = (existingSummary.messageCount ?? 0) === 0;
            await upsertSessionSummary({
              ...existingSummary,
              title: firstPrompt && prompt.trim() ? prompt.trim().slice(0, 80) : existingSummary.title,
              preview: prompt.trim().slice(0, 160),
              updatedAt: new Date().toISOString(),
              messageCount: (existingSummary.messageCount ?? 0) + 1,
            });
          }
          broadcastToRenderers("agent:event", { type: "agent_start", sessionId, timestamp: Date.now() });
          try {
            return await raw.prompt?.(content, sessionId) as T;
          } finally {
            broadcastToRenderers("agent:event", { type: "agent_settled", sessionId, timestamp: Date.now() });
          }
        }
        if (type === "cancel" || type === "abort") {
          const sessionId = resolveRuntimeCommandSessionId(payload, raw.sessionId);
          if (sessionId) interactionBroker.cancelSession(sessionId);
          return await raw.cancel?.(sessionId) as T;
        }
        if (type === "set_mode") return await raw.setMode?.(String(payload.modeId ?? payload.value), resolveRuntimeCommandSessionId(payload, raw.sessionId)) as T;
        if (type === "set_config_option") return await raw.setConfigOption?.(String(payload.configId), payload.value as string | boolean, resolveRuntimeCommandSessionId(payload, raw.sessionId)) as T;
        if (type === "set_model") return await raw.setConfigOption?.("model", String(payload.modelId ?? payload.value), resolveRuntimeCommandSessionId(payload, raw.sessionId)) as T;
        if (type === "new_session") return await raw.newSession?.(typeof payload.cwd === "string" ? payload.cwd : process.cwd()) as T;
        if (type === "get_state") return latestSnapshot?.state as T;
        if (type === "get_available_models") return (latestSnapshot?.models ?? []) as T;
        if (type === "get_commands") {
          const sessionId = resolveRuntimeCommandSessionId(payload, raw.sessionId);
          return [...(sessionId ? advertisedCommands.get(sessionId) ?? [] : [])] as T;
        }
        if (type === "side_chat") {
          const sessionId = resolveRuntimeCommandSessionId(payload, raw.sessionId);
          if (!sessionId || !advertisedCommands.get(sessionId)?.has("btw") || !extensionEnabled(raw, "cognition.ai/chains")) throw new Error("当前 Devin session 未广告 /btw");
          return await raw.sideChat?.(String(payload.message ?? ""), sessionId) as T;
        }
        if (type === "revise_command") {
          const sessionId = resolveRuntimeCommandSessionId(payload, raw.sessionId);
          return await raw.reviseCommand?.({
            command: String(payload.command ?? ""),
            instruction: String(payload.instruction ?? ""),
          }, sessionId) as T;
        }
        if (type === "reconnect") {
          interactionBroker.cancelAll();
          broadcastToRenderers("agent:event", { type: "connection_generation" });
          return await raw.restart?.() as T;
        }
        if (type === "handoff") {
          if (!advertisedCommands.get(raw.sessionId)?.has("handoff")) throw new Error("当前 Devin session 未广告 /handoff");
          return await raw.prompt?.("/handoff", raw.sessionId) as T;
        }
        return undefined as T;
      },
      authenticate: async () => { await raw.authenticate?.(); return true; },
      logout: async () => { await raw.logout?.(); },
      listSessions: async (cwd?: string) => {
        const result = await raw.listSessions?.({ ...(cwd ? { cwd } : {}) });
        const sessions = Array.isArray(result?.sessions) ? result.sessions : Array.isArray(result) ? result : [];
        return sessions.flatMap((item: unknown) => {
          const summary = mapRuntimeSessionSummary(item, cwd);
          return summary ? [summary] : [];
        });
      },
      async deleteSession(id: string) {
        const summary = latestSnapshot?.sessionId === id
          ? { sessionId: id, isLocked: latestSnapshot.locked === true }
          : undefined;
        await raw.deleteSession?.(id, summary);
      },
      async renameSession(id: string, title: string) {
        const existing = (await listSessions()).find((session) => session.id === id);
        if (!existing) return undefined;
        if (!extensionEnabled(raw, "cognition.ai/sessionRename")) return renameSession(id, title, "local");
        const result = await raw.renameSession?.(id, title);
        const confirmedTitle = result && typeof result.title === "string" ? result.title : title;
        return renameSession(id, confirmedTitle, "native");
      },
    };
  } catch {
    return undefined;
  }
}

function rendererWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
}

function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const window of rendererWindows()) window.webContents.send(channel, payload);
}

function windowForSession(sessionId: string): BrowserWindow | undefined {
  return rendererWindows().find((window) => rendererSessionIds.get(window.webContents.id) === sessionId);
}

function windowForSender(senderId: number): BrowserWindow | undefined {
  return rendererWindows().find((window) => window.webContents.id === senderId);
}

function createWindow(options: { sessionId?: string; title?: string; background?: boolean } = {}): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const windowWidth = Math.floor(workArea.width * 0.8);
  const windowHeight = Math.floor(workArea.height * 0.9);
  const centeredX = workArea.x + Math.floor((workArea.width - windowWidth) / 2);
  const centeredY = workArea.y + Math.floor((workArea.height - windowHeight) / 2);
  const focusedBounds = options.sessionId ? BrowserWindow.getFocusedWindow()?.getBounds() : undefined;
  const windowX = focusedBounds
    ? Math.min(workArea.x + workArea.width - windowWidth, Math.max(workArea.x, focusedBounds.x + 24))
    : centeredX;
  const windowY = focusedBounds
    ? Math.min(workArea.y + workArea.height - windowHeight, Math.max(workArea.y, focusedBounds.y + 24))
    : centeredY;

  const browserWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowX,
    y: windowY,
    show: false,
    backgroundColor: "#f7f7f5",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 17, y: 16 } }
      : { titleBarOverlay: { color: "#f7f7f5", symbolColor: "#4a4a4a", height: 40 } }),
    ...(!app.isPackaged ? { icon: developmentIconPath } : {}),
    ...(!app.isPackaged ? { icon: developmentIconPath } : {}),
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.cjs"),
      ...SECURE_RENDERER_WEB_PREFERENCES,
    },
  });
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = browserWindow;
  if (options.sessionId) sessionWindows.set(options.sessionId, browserWindow);

  browserWindow.once("ready-to-show", () => {
    if (browserWindow.isDestroyed()) return;
    browserWindow.setPosition(windowX, windowY);
    if (options.title) browserWindow.setTitle(`${options.title} — Devin Agent`);
    if (!options.background) browserWindow.show();
  });
  const webContentsId = browserWindow.webContents.id;
  if (options.sessionId) auxiliaryWindowIds.add(webContentsId);
  browserWindow.on("close", (event) => {
    if (mainWindow !== browserWindow || quitting || !weixinBot?.store.getState().accountId) return;
    event.preventDefault();
    browserWindow.hide();
    ensureTray();
  });
  browserWindow.on("closed", () => {
    interactionBroker.cancelOwner(webContentsId);
    auxiliaryWindowIds.delete(webContentsId);
    rendererSessionIds.delete(webContentsId);
    rendererCwds.delete(webContentsId);
    rendererWorkspaces.delete(webContentsId);
    mentionSearchControllers.get(webContentsId)?.abort();
    mentionSearchControllers.delete(webContentsId);
    if (options.sessionId && sessionWindows.get(options.sessionId) === browserWindow) sessionWindows.delete(options.sessionId);
    if (mainWindow === browserWindow) mainWindow = rendererWindows()[0];
    if (rendererWindows().length === 0) void agentHost?.stop?.();
  });
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  browserWindow.webContents.on("will-navigate", (event, url) => {
    if (url === browserWindow.webContents.getURL()) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    const url = new URL(devServer);
    if (options.sessionId) url.searchParams.set("session", options.sessionId);
    void browserWindow.loadURL(url.toString());
  } else {
    void browserWindow.loadFile(path.join(currentDirectory, "../../dist/index.html"), options.sessionId
      ? { query: { session: options.sessionId } }
      : undefined);
  }
  return browserWindow;
}

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "New thread", accelerator: "CmdOrCtrl+N", click: () => sendAppCommand("new-thread") },
        { label: "Open folder…", accelerator: "CmdOrCtrl+O", click: () => sendAppCommand("open-folder") },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendAppCommand(command: string): void {
  (BrowserWindow.getFocusedWindow() ?? mainWindow)?.webContents.send("app:command", command);
}

function ensureTray(): void {
  if (!tray) {
    tray = new Tray(trayIconPath);
    tray.setToolTip("Devin Agent · 微信 Bot");
    tray.on("double-click", showMainWindow);
  }
  void refreshTrayMenu();
}

async function refreshTrayMenu(): Promise<void> {
  if (!tray || !weixinBot) return;
  const bot = weixinBot;
  const status = await bot.getStatus();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Devin Agent", click: showMainWindow },
    {
      label: status.online ? "暂停微信 Bot" : "恢复微信 Bot",
      click: () => void (status.online ? bot.pause() : bot.start())
        .then(() => refreshTrayMenu())
        .catch(() => showMainWindow()),
    },
    { type: "separator" },
    { label: "退出 Devin Agent", click: () => { quitting = true; app.quit(); } },
  ]));
}

function showMainWindow(): void {
  const target = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!target) {
    createWindow();
    return;
  }
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

function destroyTray(): void {
  tray?.destroy();
  tray = undefined;
}

function registerIpc(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:home-directory", () => app.getPath("home"));
  ipcMain.handle("app:open-external", async (_event, value: unknown) => {
    const url = expectString(value, "url", 4_096);
    if (!isSafeExternalUrl(url)) throw new Error("Only http(s) links can be opened");
    await shell.openExternal(url);
  });
  ipcMain.handle("app:copy-text", (_event, value: unknown) => {
    clipboard.writeText(expectString(value, "clipboard text", MARKDOWN_EXPORT_MAX_CHARACTERS));
  });
  ipcMain.handle("app:save-markdown", async (ipcEvent, value: unknown) => {
    const request = parseMarkdownExportRequest(value);
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showSaveDialog(parent!, {
      title: "Download session as Markdown",
      defaultPath: path.join(app.getPath("downloads"), request.defaultName),
      buttonLabel: "Save",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fsp.writeFile(result.filePath, request.content, "utf8");
    return { saved: true, filePath: result.filePath };
  });

  ipcMain.handle("settings:get-color-scheme", () => appSettings.getColorScheme());
  ipcMain.handle("settings:set-color-scheme", (_event, preference: unknown) => appSettings.setColorScheme(expectColorScheme(preference)));
  ipcMain.handle("settings:get-language", () => appSettings.getLanguage());
  ipcMain.handle("settings:set-language", (_event, language: unknown) => appSettings.setLanguage(expectLanguage(language)));
  ipcMain.handle("settings:get-profile", () => appSettings.getProfile());
  ipcMain.handle("settings:set-profile", (_event, profile: unknown) => appSettings.setProfile(expectProfile(profile)));
  ipcMain.handle("settings:get-show-reasoning-process", () => appSettings.getShowReasoningProcess());
  ipcMain.handle("settings:set-show-reasoning-process", (_event, value: unknown) => appSettings.setShowReasoningProcess(expectBoolean(value, "show reasoning")));
  ipcMain.handle("settings:get-pinned-model-ids", () => appSettings.getPinnedModelIds());
  ipcMain.handle("settings:set-pinned-model-ids", (_event, value: unknown) => appSettings.setPinnedModelIds(expectModelIds(value)));
  ipcMain.handle("settings:get-new-session-model-id", () => appSettings.getNewSessionModelId());
  ipcMain.handle("settings:set-new-session-model-id", (_event, value: unknown) => appSettings.setNewSessionModelId(expectString(value, "new session model id", 200)));
  ipcMain.handle("settings:get-preferred-mode-id", () => appSettings.getPreferredModeId());
  ipcMain.handle("settings:set-preferred-mode-id", (_event, value: unknown) => appSettings.setPreferredModeId(expectString(value, "preferred mode id", 200)));
  ipcMain.handle("settings:get-devin-cli-path", () => appSettings.getDevinCliPath());
  ipcMain.handle("settings:set-devin-cli-path", async (_event, value: unknown) => {
    const cliPath = value === null ? null : expectString(value, "Devin CLI path", 4_096);
    if (cliPath) await validateDevinBinary(cliPath);
    await appSettings.setDevinCliPath(cliPath);
    await agentHost?.stop?.();
    agentHost = await createRuntimeHost();
    return getDevinProviderStatus();
  });
  ipcMain.handle("settings:choose-devin-cli-path", async (ipcEvent) => {
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showOpenDialog(parent!, {
      title: "Choose the Devin CLI executable",
      properties: ["openFile"],
      buttonLabel: "Use Devin CLI",
    });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return null;
    await validateDevinBinary(selected);
    await appSettings.setDevinCliPath(selected);
    await agentHost?.stop?.();
    agentHost = await createRuntimeHost();
    return getDevinProviderStatus();
  });
  ipcMain.handle("settings:get-devin-cli-update-status", async () => {
    const binary = await resolveDevinBinary();
    return checkDevinCliUpdate(binary.path, { fetchManifest: fetchReleaseManifest });
  });
  ipcMain.handle("settings:update-devin-cli", async () => {
    if (devinCliUpdatePromise) return devinCliUpdatePromise;
    devinCliUpdatePromise = updateDevinCli();
    try {
      return await devinCliUpdatePromise;
    } finally {
      devinCliUpdatePromise = undefined;
    }
  });

  ipcMain.handle("workspace:choose", async (ipcEvent) => {
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showOpenDialog(parent!, { title: "Open a workspace", properties: ["openDirectory", "createDirectory"], buttonLabel: "Open" });
    if (result.canceled || !result.filePaths[0]) return null;
    await recentWorkspaces.touch(result.filePaths[0]);
    return path.resolve(result.filePaths[0]);
  });
  ipcMain.handle("workspace:recent", () => recentWorkspaces.list());
  ipcMain.handle("workspace:forget", (_event, value: unknown) => recentWorkspaces.forget(expectString(value, "workspace path", 4_096)));
  ipcMain.handle("workspace:reorder", (_event, value: unknown) => recentWorkspaces.reorder(expectStringList(value, "workspace paths", 12, 4_096)));
  ipcMain.handle("workspace:rename", (_event, pathValue: unknown, nameValue: unknown) =>
    recentWorkspaces.rename(expectString(pathValue, "workspace path", 4_096), expectString(nameValue, "workspace name", 120)),
  );
  ipcMain.handle("workspace:open-in-devin", async (_event, value: unknown) => {
    const workspacePath = await resolveKnownWorkspace(value);
    await shell.openExternal(createDevinWorkspaceUrl(workspacePath));
  });
  ipcMain.handle("workspace:changes", async (_event, value: unknown) => {
    return listWorkspaceChanges(await resolveKnownWorkspace(value));
  });
  ipcMain.handle("workspace:diff", async (_event, workspaceValue: unknown, fileValue: unknown) => {
    return readWorkspaceDiff(
      await resolveKnownWorkspace(workspaceValue),
      expectString(fileValue, "changed file path", 4_096),
    );
  });

  ipcMain.handle("files:choose-preview", async (ipcEvent) => {
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showOpenDialog(parent!, { title: "Preview a file", properties: ["openFile"], buttonLabel: "Preview" });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = await fsp.realpath(result.filePaths[0]);
    const activeAgentCwd = rendererCwds.get(ipcEvent.sender.id);
    const workspaceRoot = activeAgentCwd ? await safeRealpath(activeAgentCwd) : undefined;
    const rootPath = workspaceRoot && isPathInside(workspaceRoot, selected) ? workspaceRoot : path.dirname(selected);
    return createFilePreview(selected, rootPath);
  });
  ipcMain.handle("files:valid-preview-paths", async (ipcEvent, value: unknown) => {
    const activeAgentCwd = rendererCwds.get(ipcEvent.sender.id);
    if (!activeAgentCwd || !Array.isArray(value)) return [];
    const rootPath = await safeRealpath(activeAgentCwd);
    if (!rootPath) return [];
    const candidates = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 500).slice(0, 12);
    const valid = await Promise.all(candidates.map(async (candidate) => {
      try {
        const target = await resolveWorkspacePreviewPath(candidate, rootPath);
        return (await fsp.stat(target)).isFile() ? candidate : undefined;
      } catch {
        return undefined;
      }
    }));
    return valid.filter((item): item is string => Boolean(item));
  });
  ipcMain.handle("files:preview", async (ipcEvent, value: unknown) => {
    const activeAgentCwd = rendererCwds.get(ipcEvent.sender.id);
    if (!activeAgentCwd) throw new Error("Open a workspace before previewing files");
    const rootPath = await safeRealpath(activeAgentCwd);
    if (!rootPath) throw new Error("The workspace is no longer available");
    return createFilePreview(await resolveWorkspacePreviewPath(expectString(value, "preview path", 4_096), rootPath), rootPath);
  });
  ipcMain.handle("files:open-preview", async (_event, value: unknown) => {
    const id = expectString(value, "preview id", 200);
    const preview = previewFiles.get(id);
    if (!preview) throw new Error("This preview is no longer available");
    const error = await shell.openPath(preview.filePath);
    if (error) throw new Error(error);
  });
  ipcMain.handle("mentions:set-workspace", async (ipcEvent, value: unknown) => {
    if (value === undefined) {
      rendererWorkspaces.delete(ipcEvent.sender.id);
      return;
    }
    rendererWorkspaces.set(ipcEvent.sender.id, await resolveKnownWorkspace(value));
  });
  ipcMain.handle("mentions:search", async (ipcEvent, value: unknown) => {
    const request = parseMentionSearchRequest(value);
    const workspacePath = rendererWorkspaces.get(ipcEvent.sender.id);
    if (!workspacePath || path.resolve(request.workspacePath) !== path.resolve(workspacePath)) {
      throw new Error("Mention search is limited to the currently selected project");
    }
    mentionSearchControllers.get(ipcEvent.sender.id)?.abort();
    const controller = new AbortController();
    mentionSearchControllers.set(ipcEvent.sender.id, controller);
    try {
      return await mentionIndex.search(workspacePath, request.kind, request.query, request.limit, controller.signal);
    } finally {
      if (mentionSearchControllers.get(ipcEvent.sender.id) === controller) mentionSearchControllers.delete(ipcEvent.sender.id);
    }
  });
  ipcMain.handle("mentions:skills", async (ipcEvent, value: unknown) => {
    const request = parseSkillListRequest(value);
    const workspacePath = rendererWorkspaces.get(ipcEvent.sender.id);
    if (request.workspacePath && (!workspacePath || path.resolve(request.workspacePath) !== path.resolve(workspacePath))) {
      throw new Error("Skill discovery is limited to the currently selected project");
    }
    if (request.sessionId) {
      const activeSessionId = rendererSessionIds.get(ipcEvent.sender.id);
      if (activeSessionId && activeSessionId !== request.sessionId) throw new Error("Skill discovery is limited to the active session");
      return [...await skillIndex.bindSession(request.sessionId, workspacePath)];
    }
    return [...(request.refresh
      ? await skillIndex.refreshDraft(workspacePath)
      : await skillIndex.listDraft(workspacePath))];
  });

  ipcMain.handle("sessions:list", async (ipcEvent, cwd: unknown) => {
    const requestedCwd = cwd === undefined ? undefined : expectString(cwd, "cwd", 4_096);
    const botSessionId = weixinBot?.store.getState().sessionId;
    try {
      const remote = await agentHost?.listSessions?.(requestedCwd);
      if (remote) {
        for (const summary of remote) {
          if (summary.id !== botSessionId) await upsertSessionSummary(summary);
        }
        return (await listSessions(requestedCwd)).filter((session) => session.id !== botSessionId);
      }
    } catch (error) {
      ipcEvent.sender.send("agent:error", safeError(error));
    }
    return (await listSessions(requestedCwd)).filter((session) => session.id !== botSessionId);
  });
  ipcMain.handle("sessions:pin", (_event, id: unknown, pinned: unknown) => setSessionPinned(expectMutableSessionId(id), expectBoolean(pinned, "pinned")));
  ipcMain.handle("sessions:reorder", (_event, ids: unknown) => reorderSessions(expectStringList(ids, "session ids", 500, 200)));
  ipcMain.handle("sessions:rename", async (_event, id: unknown, title: unknown) => {
    const sessionId = expectMutableSessionId(id);
    const sessionTitle = expectString(title, "session title", 120).trim();
    if (!sessionTitle) throw new Error("Session title must be between 1 and 120 characters");
    const renamed = agentHost?.renameSession
      ? await agentHost.renameSession(sessionId, sessionTitle)
      : await renameSession(sessionId, sessionTitle, "local");
    if (renamed) broadcastToRenderers("agent:event", { type: "session_renamed", session: renamed });
    return renamed;
  });
  ipcMain.handle("sessions:archive", (_event, id: unknown) => archiveSession(expectMutableSessionId(id)));
  ipcMain.handle("sessions:unarchive", (_event, id: unknown) => unarchiveSession(expectMutableSessionId(id)));
  ipcMain.handle("sessions:open-in-new-window", async (_event, id: unknown) => {
    const sessionId = expectMutableSessionId(id);
    const session = (await listSessions()).find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error("This Devin session is no longer available");
    const existing = sessionWindows.get(sessionId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }
    createWindow({ sessionId, title: session.title });
  });
  ipcMain.handle("sessions:delete", async (_event, id: unknown) => {
    const sessionId = expectMutableSessionId(id);
    if (!agentHost?.deleteSession) throw new Error("当前 Devin ACP 未提供 session/delete");
    await agentHost.deleteSession(sessionId);
    await removeSessionSummary(sessionId);
    skillIndex.deleteSession(sessionId);
  });

  ipcMain.handle("auth:status", async (): Promise<ProviderStatus[]> => [await getDevinProviderStatus()]);
  ipcMain.handle("auth:login", async (ipcEvent) => {
    const connected = await agentHost?.authenticate?.();
    if (connected) ipcEvent.sender.send("auth:event", { kind: "complete", providerId: "devin" } satisfies AuthUiEvent);
    return connected === true;
  });
  ipcMain.handle("auth:logout", () => agentHost?.logout?.());
  ipcMain.handle("auth:respond", (_event, id: unknown, value: unknown) => {
    const prompt = authPrompts.get(expectString(id, "auth prompt id", 200));
    if (!prompt) return;
    authPrompts.delete(id as string);
    prompt.resolve(expectString(value, "auth response", 16_384));
  });

  ipcMain.handle("agent:start", async (ipcEvent, value: unknown) => {
    const options = expectAgentStartOptions(value);
    const requestedSessionId = options.sessionId ?? options.sessionPath;
    if (requestedSessionId && requestedSessionId === weixinBot?.store.getState().sessionId) {
      throw new Error("微信 Bot 固定会话只能从微信 Bot 管理界面使用");
    }
    if (options.cwd) rendererCwds.set(ipcEvent.sender.id, options.cwd);
    if (options.project && options.cwd) {
      await recentWorkspaces.touch(options.cwd);
      rendererWorkspaces.set(ipcEvent.sender.id, await resolveKnownWorkspace(options.cwd));
    } else {
      rendererWorkspaces.delete(ipcEvent.sender.id);
    }
    if (!agentHost?.start) throw new Error("Devin ACP runtime is not available. Install Devin CLI and restart the app.");
    const workspacePath = rendererWorkspaces.get(ipcEvent.sender.id);
    const creatingNewSession = !options.sessionId && !options.sessionPath && !options.capabilitiesOnly;
    const preparedSkills = creatingNewSession ? await skillIndex.refreshDraft(workspacePath) : undefined;
    if (creatingNewSession && workspacePath) await mentionIndex.refresh(workspacePath);
    const snapshot = await agentHost.start(options);
    if (options.capabilitiesOnly) rendererSessionIds.delete(ipcEvent.sender.id);
    if (!options.capabilitiesOnly && snapshot.sessionId) {
      if (preparedSkills) skillIndex.setSessionSnapshot(snapshot.sessionId, preparedSkills);
      else await skillIndex.bindSession(snapshot.sessionId, workspacePath);
      rendererSessionIds.set(ipcEvent.sender.id, snapshot.sessionId);
      if (auxiliaryWindowIds.has(ipcEvent.sender.id)) {
        const senderWindow = windowForSender(ipcEvent.sender.id);
        for (const [sessionId, window] of sessionWindows) {
          if (window === senderWindow) sessionWindows.delete(sessionId);
        }
        if (senderWindow) sessionWindows.set(snapshot.sessionId, senderWindow);
      }
    }
    if (!options.capabilitiesOnly && snapshot.sessionId && options.cwd) {
      const now = new Date().toISOString();
      const existing = (await listSessions()).find((session) => session.id === snapshot.sessionId);
      const snapshotModel = snapshot.state.model as { id?: string } | undefined;
      await upsertSessionSummary({
        id: snapshot.sessionId,
        path: snapshot.sessionId,
        cwd: options.cwd,
        title: existing?.title ?? "New task",
        createdAt: existing?.createdAt ?? now,
        updatedAt: existing?.updatedAt ?? now,
        provider: "devin",
        ...(snapshotModel?.id ? { model: snapshotModel.id } : {}),
        ...(snapshot.locked !== undefined ? { locked: snapshot.locked } : {}),
      });
      if (auxiliaryWindowIds.has(ipcEvent.sender.id)) {
        windowForSender(ipcEvent.sender.id)?.setTitle(`${existing?.title ?? "New task"} — Devin Agent`);
      }
    }
    return snapshot;
  });
  ipcMain.handle("agent:stop", () => agentHost?.stop?.());
  ipcMain.handle("agent:command", (ipcEvent, type: unknown, data: unknown) => {
    const command = expectString(type, "agent command", 100);
    if (!ALLOWED_AGENT_COMMANDS.has(command)) throw new Error(`Unsupported agent command: ${command}`);
    const suppliedPayload = data === undefined ? undefined : expectRecord(data, "agent command data");
    const rendererSessionId = rendererSessionIds.get(ipcEvent.sender.id);
    const sessionPayload = rendererSessionId && typeof suppliedPayload?.sessionId !== "string"
      ? { ...suppliedPayload, sessionId: rendererSessionId }
      : suppliedPayload;
    const payload = command === "prompt" || command === "follow_up"
      ? { ...sessionPayload, workspacePath: rendererWorkspaces.get(ipcEvent.sender.id) }
      : sessionPayload;
    if (!agentHost?.request && !agentHost?.command) throw new Error("Devin ACP runtime is not available");
    return agentHost.request?.(command, payload) ?? agentHost.command?.(command, payload);
  });
  ipcMain.handle("agent:ui-response", (_event, id: unknown, response: unknown) => {
    const requestId = expectString(id, "request id", 200);
    const data = expectRecord(response, "UI response");
    const pending = interactionBroker.get(requestId);
    if (pending) {
      return respondToDesktopInteraction(requestId, pending.request as DesktopInteractionRequest, data);
    }
    if (!agentHost?.respondToUi) throw new Error("Devin ACP runtime is not available");
    return agentHost.respondToUi(requestId, data);
  });

  ipcMain.handle("weixin:status", () => requireWeixinBot().getStatus());
  ipcMain.handle("weixin:choose-workspace", async (ipcEvent) => {
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showOpenDialog(parent!, {
      title: "选择微信 Bot 工作目录",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "选择并继续",
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("weixin:configure-workspace", (_event, value: unknown) => {
    return requireWeixinBot().configureWorkspace(expectString(value, "微信 Bot 工作目录", 4_096));
  });
  ipcMain.handle("weixin:choose-attachments", async (ipcEvent) => {
    const state = requireWeixinBot().store.getState();
    if (!state.workspacePath) throw new Error("请先配置微信 Bot 工作目录");
    const parent = windowForSender(ipcEvent.sender.id) ?? mainWindow;
    const result = await dialog.showOpenDialog(parent!, {
      title: "从工作目录发送到微信",
      defaultPath: state.workspacePath,
      properties: ["openFile", "multiSelections"],
      buttonLabel: "添加",
    });
    if (result.canceled) return [];
    const root = await fsp.realpath(state.workspacePath);
    const files: string[] = [];
    for (const candidate of result.filePaths.slice(0, 10)) {
      const real = await fsp.realpath(candidate);
      if (!isPathInside(root, real)) throw new Error("只能选择微信 Bot 工作目录内的文件");
      const stat = await fsp.stat(real);
      if (!stat.isFile() || stat.size > 100 * 1024 * 1024) {
        throw new Error("附件必须是 100 MB 以内的文件");
      }
      files.push(real);
    }
    return files;
  });
  ipcMain.handle("weixin:login-start", () => requireWeixinBot().startLogin());
  ipcMain.handle("weixin:login-wait", (_event, value: unknown) => {
    return requireWeixinBot().waitLogin(expectString(value, "微信登录会话 id", 200));
  });
  ipcMain.handle("weixin:login-verify", (_event, sessionValue: unknown, codeValue: unknown) => {
    return requireWeixinBot().submitVerifyCode(
      expectString(sessionValue, "微信登录会话 id", 200),
      expectString(codeValue, "微信验证码", 8),
    );
  });
  ipcMain.handle("weixin:start", async () => {
    await requireWeixinBot().start();
    ensureTray();
  });
  ipcMain.handle("weixin:pause", async () => {
    await requireWeixinBot().pause();
    await refreshTrayMenu();
  });
  ipcMain.handle("weixin:disconnect", async () => {
    await requireWeixinBot().disconnect();
    await refreshTrayMenu();
  });
  ipcMain.handle("weixin:history", (_event, value: unknown) => {
    const query = value === undefined ? {} : expectRecord(value, "微信消息分页参数");
    return requireWeixinBot().history({
      ...(query.before === undefined ? {} : { before: expectPositiveInteger(query.before, "before") }),
      ...(query.limit === undefined ? {} : { limit: expectPositiveInteger(query.limit, "limit", 200) }),
    });
  });
  ipcMain.handle("weixin:send", (_event, value: unknown) => {
    const input = expectRecord(value, "微信消息");
    const text = expectString(input.text, "微信消息文本", 100_000);
    const attachmentPaths = input.attachmentPaths === undefined
      ? []
      : expectStringList(input.attachmentPaths, "微信附件路径", 10, 4_096);
    return requireWeixinBot().send(text, attachmentPaths);
  });
  ipcMain.handle("weixin:abort", () => requireWeixinBot().abortTurn());
  ipcMain.handle("weixin:set-auto-launch", async (_event, value: unknown) => {
    const enabled = expectBoolean(value, "微信 Bot 开机启动");
    app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? ["--weixin-background"] : [] });
    await requireWeixinBot().setAutoLaunch(enabled);
  });
  ipcMain.handle("weixin:clear", async (_event, value: unknown) => {
    await requireWeixinBot().clearAllData(expectString(value, "微信 Bot 清除确认", 100));
    app.setLoginItemSettings({ openAtLogin: false, args: [] });
    destroyTray();
  });
}

const ALLOWED_AGENT_COMMANDS = new Set(["prompt", "cancel", "abort", "follow_up", "side_chat", "new_session", "get_state", "set_model", "set_mode", "set_config_option", "get_available_models", "get_available_thinking_levels", "compact", "get_session_stats", "get_commands", "handoff", "reconnect"]);

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === "darwin") app.dock?.setIcon(developmentIconPath);
  await migrateDesktopData();
  recentWorkspaces = new RecentWorkspaces(path.join(app.getPath("userData"), "recent-workspaces.json"));
  appSettings = new AppSettings(appSettingsFile);
  weixinBot = new WeixinBotService(
    path.join(app.getPath("userData"), "weixin"),
    app.getVersion(),
    appSettings,
    (event) => {
      broadcastToRenderers("weixin:event", event);
      if (event.type === "status") {
        if (event.status.accountId) ensureTray();
        else destroyTray();
      }
    },
  );
  configureSessionIndex(sessionIndexFile);
  agentHost = await createRuntimeHost();
  installFilePreviewProtocol();
  registerIpc();
  installMenu();
  await weixinBot.initialize();
  const background = process.argv.includes("--weixin-background") && Boolean(weixinBot.store.getState().accountId);
  createWindow({ background });
  if (weixinBot.store.getState().accountId) ensureTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !weixinBot?.store.getState().accountId) app.quit();
});
app.on("before-quit", () => {
  quitting = true;
  interactionBroker.cancelAll();
  void agentHost?.stop?.();
  void weixinBot?.shutdown();
});

async function getDevinProviderStatus(): Promise<ProviderStatus> {
  try {
    const binary = await resolveDevinBinary();
    return {
      id: "devin",
      name: "Devin CLI",
      configured: true,
      source: "external-cli",
      defaultModel: "",
      version: binary.version,
      binaryPath: binary.path,
      authenticated: "unknown",
    };
  } catch (error) {
    return { id: "devin", name: "Devin CLI", configured: false, source: "external-cli", defaultModel: "", authenticated: false, error: safeError(error) };
  }
}

async function resolveDevinBinary() {
  const configuredPath = await appSettings.getDevinCliPath();
  return configuredPath
    ? { ...(await validateDevinBinary(configuredPath)), source: "configured" as const }
    : discoverDevinBinary();
}

const fetchReleaseManifest: ManifestFetcher = (url, init) => net.fetch(url, { signal: init.signal });

async function updateDevinCli(): Promise<DevinCliUpdateStatus> {
  const binary = await resolveDevinBinary();
  const status = await checkDevinCliUpdate(binary.path, { fetchManifest: fetchReleaseManifest });
  if (status.state !== "available" || !status.latestVersion) return status;

  await agentHost?.stop?.();
  await weixinBot?.stopAgentRuntime();
  agentHost = undefined;
  try {
    return await installDevinCliUpdate(binary.path, status.latestVersion);
  } finally {
    agentHost = await createRuntimeHost();
  }
}

async function migrateDesktopData(): Promise<void> {
  if (legacyUserDataPath === stableUserDataPath) return;
  const source = path.join(legacyUserDataPath, "recent-workspaces.json");
  const target = path.join(stableUserDataPath, "recent-workspaces.json");
  try { await fsp.access(target); return; } catch { /* copy only when absent */ }
  try { await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL); await fsp.chmod(target, 0o600); } catch { /* migration is best effort */ }
}

function installFilePreviewProtocol(): void {
  protocol.handle("devin-preview", async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const segments = requestUrl.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
      const requestedId = segments[0];
      const direct = requestedId ? previewFiles.get(requestedId) : undefined;
      const preview = direct ?? (activePreviewId ? previewFiles.get(activePreviewId) : undefined);
      if (!preview) return new Response("Preview not found", { status: 404 });
      const candidate = path.resolve(preview.rootPath, ...(direct ? segments.slice(1) : segments));
      const filePath = await fsp.realpath(candidate);
      if (!isPathInside(preview.rootPath, filePath)) return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      return new Response(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "Not found" : "Unable to load preview", { status: 404 });
    }
  });
}

async function createFilePreview(filePath: string, rootPath: string): Promise<FilePreview> {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new Error("Only files can be previewed");
  const extension = path.extname(filePath).toLowerCase();
  const kind = previewKind(extension);
  const id = randomUUID();
  const relativePath = path.relative(rootPath, filePath);
  const encodedPath = relativePath.split(path.sep).map((segment) => encodeURIComponent(segment)).join("/");
  const textPreview = kind === "markdown" || kind === "code" || kind === "text";
  const tooLarge = textPreview && stats.size > 3 * 1024 * 1024;
  const content = textPreview && !tooLarge ? await fsp.readFile(filePath, "utf8") : undefined;
  previewFiles.set(id, { filePath, rootPath });
  activePreviewId = id;
  while (previewFiles.size > 12) {
    const oldest = previewFiles.keys().next().value as string | undefined;
    if (!oldest) break;
    previewFiles.delete(oldest);
  }
  return { id, path: filePath, name: path.basename(filePath), extension: extension.slice(1), kind, url: `devin-preview://file/${id}/${encodedPath}`, size: stats.size, modifiedAt: stats.mtime.toISOString(), ...(content !== undefined ? { content } : {}), ...(tooLarge ? { tooLarge: true } : {}) };
}

async function resolveWorkspacePreviewPath(requestedPath: string, rootPath: string): Promise<string> {
  const expanded = requestedPath.startsWith(`~${path.sep}`) ? path.join(app.getPath("home"), requestedPath.slice(2)) : requestedPath;
  const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(rootPath, expanded);
  const filePath = await fsp.realpath(resolved);
  if (!isPathInside(rootPath, filePath)) throw new Error("The file is outside the current workspace");
  return filePath;
}

function previewKind(extension: string): FilePreviewKind {
  if ([".html", ".htm"].includes(extension)) return "html";
  if ([".md", ".mdx", ".markdown"].includes(extension)) return "markdown";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg", ".ico"].includes(extension)) return "image";
  if (extension === ".pdf") return "pdf";
  if ([".mp4", ".webm", ".mov", ".m4v", ".ogv"].includes(extension)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(extension)) return "audio";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".scss", ".sass", ".less", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".vue", ".svelte", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts", ".swift", ".c", ".h", ".cc", ".cpp", ".cs", ".php", ".sh", ".bash", ".zsh", ".fish", ".sql", ".graphql"].includes(extension)) return "code";
  if ([".txt", ".log", ".csv", ".tsv", ".ini", ".conf", ".config", ".env", ".gitignore"].includes(extension)) return "text";
  return "unsupported";
}

async function safeRealpath(value: string): Promise<string | undefined> {
  try { return await fsp.realpath(value); } catch { return undefined; }
}

async function resolveKnownWorkspace(value: unknown): Promise<string> {
  const requestedPath = path.resolve(expectString(value, "workspace path", 4_096));
  const knownWorkspaces = await recentWorkspaces.list();
  if (!knownWorkspaces.some((workspace) => path.resolve(workspace.path) === requestedPath)) {
    throw new Error("Only a project previously opened in Devin Agent can be inspected");
  }
  const workspacePath = await safeRealpath(requestedPath);
  if (!workspacePath || !(await fsp.stat(workspacePath)).isDirectory()) {
    throw new Error("The project folder is no longer available");
  }
  return workspacePath;
}

function expectString(value: unknown, name: string, maxLength: number): string {
  return validateIpcString(value, name, maxLength);
}
function expectBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${name}`);
  return value;
}
function expectRecord(value: unknown, name: string): Record<string, unknown> {
  return validateIpcRecord(value, name);
}
function expectLanguage(value: unknown): LanguagePreference {
  if (value !== "system" && value !== "zh-CN" && value !== "en") throw new Error("Unsupported language preference");
  return value;
}
function expectColorScheme(value: unknown): ColorSchemePreference {
  if (value !== "system" && value !== "light" && value !== "dark") throw new Error("Unsupported color scheme preference");
  return value;
}
function expectProfile(value: unknown): UserProfile {
  const profile = expectRecord(value, "profile");
  return { nickname: expectString(profile.nickname, "nickname", 60), ...(typeof profile.avatarDataUrl === "string" ? { avatarDataUrl: profile.avatarDataUrl } : {}) };
}
function expectModelIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("Invalid pinned model ids");
  return value.map((entry) => expectString(entry, "model id", 200));
}
function expectStringList(value: unknown, name: string, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`Invalid ${name}`);
  return value.map((entry) => expectString(entry, name, maxItemLength));
}
function expectPositiveInteger(value: unknown, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
function expectMutableSessionId(value: unknown): string {
  const sessionId = expectString(value, "session id", 200);
  if (sessionId === weixinBot?.store.getState().sessionId) {
    throw new Error("微信 Bot 固定会话只能从微信 Bot 管理界面修改");
  }
  return sessionId;
}
function requireWeixinBot(): WeixinBotService {
  if (!weixinBot) throw new Error("微信 Bot 服务尚未初始化");
  return weixinBot;
}
function expectAgentStartOptions(value: unknown): AgentStartOptions {
  const data = expectRecord(value, "agent options");
  if (data.provider !== "devin") throw new Error("Only Devin CLI is supported");
  if (typeof data.permission !== "string" || typeof data.sandbox !== "string") throw new Error("Agent permission and sandbox are required");
  return {
    provider: "devin",
    permission: data.permission,
    sandbox: data.sandbox,
    ...(typeof data.cwd === "string" ? { cwd: path.resolve(data.cwd) } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(typeof data.effort === "string" ? { effort: data.effort } : {}),
    ...(typeof data.sessionPath === "string" ? { sessionPath: data.sessionPath } : {}),
    ...(typeof data.sessionId === "string" ? { sessionId: data.sessionId } : {}),
    ...(data.replaySession === undefined ? {} : { replaySession: expectBoolean(data.replaySession, "replay session") }),
    ...(data.capabilitiesOnly === undefined ? {} : { capabilitiesOnly: expectBoolean(data.capabilitiesOnly, "capabilities only") }),
    ...(Array.isArray(data.additionalDirectories)
      ? { additionalDirectories: data.additionalDirectories.map((entry) => expectString(entry, "additional directory", 4_096)).map((entry) => path.resolve(entry)).slice(0, 16) }
      : {}),
    ...(data.project === undefined ? {} : { project: expectBoolean(data.project, "project") }),
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out while cancelling the active Devin prompt");
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(bearer\s+|token|secret|password|api[_-]?key)[=:]?\s*\S+/gi, "$1 [REDACTED]").replace(/\s+/g, " ").slice(0, 500);
}
