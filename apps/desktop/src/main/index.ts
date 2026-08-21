import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  shell,
} from "electron";
import { discoverDevinBinary, validateDevinBinary } from "./devin-discovery";
import { checkDevinCliUpdate, installDevinCliUpdate, type ManifestFetcher } from "./devin-update";
import { AppSettings } from "./app-settings";
import { RecentWorkspaces } from "./recent-workspaces";
import { listCodexThemes } from "./themes";
import {
  archiveSession,
  configureSessionIndex,
  listSessions,
  removeSessionSummary,
  setSessionPinned,
  unarchiveSession,
  upsertSessionSummary,
} from "./session-index";
import {
  buildAgentSnapshot,
  mapRuntimeSessionSummary,
  permissionDecisionFromUi,
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
  FilePreview,
  FilePreviewKind,
  DevinCliUpdateStatus,
  LanguagePreference,
  ProviderStatus,
  SessionSummary,
  UserProfile,
} from "../shared/types";

/**
 * The ACP implementation is owned by the runtime layer. The shell only relies
 * on this narrow structural contract so it can be tested without a CLI.
 */
type RuntimeHost = {
  start?(options: AgentStartOptions): Promise<AgentSnapshot>;
  stop?(): Promise<void>;
  request?<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T>;
  command?<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T>;
  respondToUi?(id: string, response: Record<string, unknown>): Promise<void>;
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
let activeAgentCwd: string | undefined;
let devinCliUpdatePromise: Promise<DevinCliUpdateStatus> | undefined;
const previewFiles = new Map<string, { filePath: string; rootPath: string }>();
let activePreviewId: string | undefined;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
// Electron's native macOS icon loader does not reliably accept SVG paths.
// Reuse the verified PNG asset in development so a cosmetic icon failure can
// never abort BrowserWindow construction.
const developmentIconPath = path.join(currentDirectory, "../../build/icon.png");
const legacyUserDataPath = app.getPath("userData");
const userDataOverride = process.env.DEVIN_AGENT_USER_DATA;
const stableUserDataPath = userDataOverride
  ? path.resolve(userDataOverride)
  : path.join(app.getPath("appData"), "Devin Agent");
const appSettingsFile = path.join(stableUserDataPath, "app-settings.json");
const sessionIndexFile = path.join(stableUserDataPath, "session-index.json");
const authPrompts = new Map<string, { resolve(value: string): void; reject(error: Error): void }>();
const permissionRequests = new Map<string, { allowed: Set<string>; resolve(decision: unknown): void }>();

protocol.registerSchemesAsPrivileged([{
  scheme: "devin-preview",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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
    let advertisedCommands = new Set<string>();
    const configuredPath = await appSettings.getDevinCliPath();
    const host = new Constructor({
      ...(configuredPath ? { binaryPath: configuredPath } : {}),
      onUpdate: (event: { method: string; sessionId?: string; update?: unknown; params?: unknown; receivedAt?: number }) => {
        if (event.update && typeof event.update === "object") {
          const update = event.update as Record<string, unknown>;
          if (update.sessionUpdate === "available_commands_update" && Array.isArray(update.availableCommands)) {
            advertisedCommands = new Set(update.availableCommands.flatMap((command) => {
              if (typeof command === "string") return [command.replace(/^\//, "").toLowerCase()];
              if (!command || typeof command !== "object") return [];
              const name = (command as Record<string, unknown>).name ?? (command as Record<string, unknown>).command;
              return typeof name === "string" ? [name.replace(/^\//, "").toLowerCase()] : [];
            }));
          }
        }
        mainWindow?.webContents.send("agent:event", {
          type: "acp_update",
          sessionId: event.sessionId,
          update: event.update,
          params: event.params,
          timestamp: event.receivedAt,
        });
      },
      onStateChange: (state: string, error?: Error) => mainWindow?.webContents.send("agent:event", { type: "agent_state", state, ...(error ? { error: safeError(error) } : {}) }),
      onDiagnostic: (diagnostic: unknown) => mainWindow?.webContents.send("agent:event", { type: "agent_diagnostic", diagnostic }),
      openExternal: (url: string) => shell.openExternal(url),
      onPermissionRequest: async (request: unknown) => {
        const requestRecord = request && typeof request === "object" ? request as Record<string, unknown> : {};
        const id = typeof requestRecord.id === "string" ? requestRecord.id : randomUUID();
        const options = Array.isArray(requestRecord.options)
          ? requestRecord.options.map((option) => {
            const value = option && typeof option === "object" ? option as Record<string, unknown> : {};
            return { id: String(value.optionId ?? value.id ?? ""), label: String(value.label ?? value.name ?? value.optionId ?? value.id ?? ""), description: typeof value.description === "string" ? value.description : undefined };
          }).filter((option) => option.id)
          : [];
        mainWindow?.webContents.send("agent:event", { type: "permission_request", id, title: "Devin needs permission", message: "Choose an action for this request.", options, request: requestRecord });
        return new Promise((resolve) => {
          permissionRequests.set(id, { allowed: new Set(options.map((option) => option.id)), resolve });
          setTimeout(() => {
            const pending = permissionRequests.get(id);
            if (!pending) return;
            permissionRequests.delete(id);
            pending.resolve(null);
          }, 120_000);
        });
      },
    }) as any;
    const raw = host as any;
    let pendingRuntimeStart: { key: string; promise: Promise<AgentSnapshot> } | undefined;
    const startRuntime = async (options: AgentStartOptions): Promise<AgentSnapshot> => {
      let capabilities = await raw.start?.();
      const targetSessionId = options.sessionId ?? options.sessionPath;
      const cwd = options.cwd ?? raw.session?.cwd;
      let session: Record<string, unknown> | undefined;
      if (targetSessionId) {
        if (!cwd) throw new Error("A workspace path is required to load this Devin session");
        session = raw.sessionId && raw.sessionId !== targetSessionId
          ? await raw.switchSession?.(targetSessionId, { cwd, additionalDirectories: options.additionalDirectories })
          : raw.sessionId === targetSessionId && raw.session
            ? raw.session
            : await raw.loadSession?.(targetSessionId, { cwd, additionalDirectories: options.additionalDirectories });
      } else {
        if (!cwd) throw new Error("Open a workspace before creating a Devin session");
        if (raw.sessionId) {
          await raw.cancel?.();
          const canClose = raw.negotiatedCapabilities?.sessionCapabilities?.close !== undefined;
          if (canClose) await raw.closeSession?.();
          else capabilities = await raw.restart?.();
        }
        session = await raw.newSession?.(cwd, { additionalDirectories: options.additionalDirectories });
      }
      if (!session) throw new Error("Devin ACP did not return a session");
      latestSnapshot = buildAgentSnapshot(capabilities ?? raw.negotiatedCapabilities, session, options.model || undefined);
      return latestSnapshot;
    };
    return {
      start(options) {
        const key = JSON.stringify([options.cwd, options.sessionId, options.sessionPath, options.additionalDirectories, options.model]);
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
        for (const pending of permissionRequests.values()) pending.resolve(null);
        permissionRequests.clear();
        await raw.stop?.();
      },
      async command<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T> {
        const payload = data ?? {};
        if (type === "prompt" || type === "follow_up") {
          const prompt = typeof payload.message === "string" ? payload.message : typeof payload.prompt === "string" ? payload.prompt : "";
          const images = Array.isArray(payload.images) ? payload.images : [];
          const content = [{ type: "text", text: prompt }, ...images.filter((image): image is Record<string, unknown> => Boolean(image && typeof image === "object"))];
          if (type === "follow_up") {
            await raw.cancel?.();
            await waitUntil(() => raw.isPromptRunning !== true, 5_000);
          }
          mainWindow?.webContents.send("agent:event", { type: "agent_start", sessionId: raw.sessionId, timestamp: Date.now() });
          try {
            return await raw.prompt?.(content, raw.sessionId) as T;
          } finally {
            mainWindow?.webContents.send("agent:event", { type: "agent_settled", sessionId: raw.sessionId, timestamp: Date.now() });
          }
        }
        if (type === "cancel" || type === "abort") return await raw.cancel?.() as T;
        if (type === "set_mode") return await raw.setMode?.(String(payload.modeId ?? payload.value)) as T;
        if (type === "set_config_option") return await raw.setConfigOption?.(String(payload.configId), payload.value as string | boolean) as T;
        if (type === "set_model") return await raw.setConfigOption?.("model", String(payload.modelId ?? payload.value)) as T;
        if (type === "new_session") return await raw.newSession?.(typeof payload.cwd === "string" ? payload.cwd : process.cwd()) as T;
        if (type === "get_state") return latestSnapshot?.state as T;
        if (type === "get_available_models") return (latestSnapshot?.models ?? []) as T;
        if (type === "get_commands") return [...advertisedCommands] as T;
        if (type === "reconnect") return await raw.restart?.() as T;
        if (type === "handoff") {
          if (!advertisedCommands.has("handoff")) throw new Error("当前 Devin session 未广告 /handoff");
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
    };
  } catch {
    return undefined;
  }
}

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();
  const windowWidth = Math.floor(workArea.width * 0.8);
  const windowHeight = Math.floor(workArea.height * 0.9);
  const windowX = workArea.x + Math.floor((workArea.width - windowWidth) / 2);
  const windowY = workArea.y + Math.floor((workArea.height - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowX,
    y: windowY,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f7f7f5",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 17, y: 16 },
    ...(!app.isPackaged ? { icon: developmentIconPath } : {}),
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.cjs"),
      ...SECURE_RENDERER_WEB_PREFERENCES,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.setPosition(windowX, windowY);
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
    void agentHost?.stop?.();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === mainWindow?.webContents.getURL()) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void mainWindow.loadURL(devServer);
  else void mainWindow.loadFile(path.join(currentDirectory, "../../dist/index.html"));
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
  mainWindow?.webContents.send("app:command", command);
}

function registerIpc(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:home-directory", () => app.getPath("home"));
  ipcMain.handle("app:open-external", async (_event, value: unknown) => {
    const url = expectString(value, "url", 4_096);
    if (!isSafeExternalUrl(url)) throw new Error("Only http(s) links can be opened");
    await shell.openExternal(url);
  });

  ipcMain.handle("themes:list", () => listCodexThemes());
  ipcMain.handle("themes:get-active", () => appSettings.getThemeId());
  ipcMain.handle("themes:set-active", (_event, id: unknown) => appSettings.setThemeId(id === null ? null : expectString(id, "theme id", 200)));

  ipcMain.handle("settings:get-language", () => appSettings.getLanguage());
  ipcMain.handle("settings:set-language", (_event, language: unknown) => appSettings.setLanguage(expectLanguage(language)));
  ipcMain.handle("settings:get-profile", () => appSettings.getProfile());
  ipcMain.handle("settings:set-profile", (_event, profile: unknown) => appSettings.setProfile(expectProfile(profile)));
  ipcMain.handle("settings:get-show-reasoning-process", () => appSettings.getShowReasoningProcess());
  ipcMain.handle("settings:set-show-reasoning-process", (_event, value: unknown) => appSettings.setShowReasoningProcess(expectBoolean(value, "show reasoning")));
  ipcMain.handle("settings:get-pinned-model-ids", () => appSettings.getPinnedModelIds());
  ipcMain.handle("settings:set-pinned-model-ids", (_event, value: unknown) => appSettings.setPinnedModelIds(expectModelIds(value)));
  ipcMain.handle("settings:get-devin-cli-path", () => appSettings.getDevinCliPath());
  ipcMain.handle("settings:set-devin-cli-path", async (_event, value: unknown) => {
    const cliPath = value === null ? null : expectString(value, "Devin CLI path", 4_096);
    if (cliPath) await validateDevinBinary(cliPath);
    await appSettings.setDevinCliPath(cliPath);
    await agentHost?.stop?.();
    agentHost = await createRuntimeHost();
    return getDevinProviderStatus();
  });
  ipcMain.handle("settings:choose-devin-cli-path", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
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

  ipcMain.handle("workspace:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "Open a workspace", properties: ["openDirectory", "createDirectory"], buttonLabel: "Open" });
    if (result.canceled || !result.filePaths[0]) return null;
    await recentWorkspaces.touch(result.filePaths[0]);
    return path.resolve(result.filePaths[0]);
  });
  ipcMain.handle("workspace:recent", () => recentWorkspaces.list());
  ipcMain.handle("workspace:forget", (_event, value: unknown) => recentWorkspaces.forget(expectString(value, "workspace path", 4_096)));

  ipcMain.handle("files:choose-preview", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "Preview a file", properties: ["openFile"], buttonLabel: "Preview" });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = await fsp.realpath(result.filePaths[0]);
    const workspaceRoot = activeAgentCwd ? await safeRealpath(activeAgentCwd) : undefined;
    const rootPath = workspaceRoot && isPathInside(workspaceRoot, selected) ? workspaceRoot : path.dirname(selected);
    return createFilePreview(selected, rootPath);
  });
  ipcMain.handle("files:valid-preview-paths", async (_event, value: unknown) => {
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
  ipcMain.handle("files:preview", async (_event, value: unknown) => {
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

  ipcMain.handle("sessions:list", async (_event, cwd: unknown) => {
    const requestedCwd = cwd === undefined ? undefined : expectString(cwd, "cwd", 4_096);
    try {
      const remote = await agentHost?.listSessions?.(requestedCwd);
      if (remote) {
        for (const summary of remote) await upsertSessionSummary(summary);
        return remote;
      }
    } catch (error) {
      mainWindow?.webContents.send("agent:error", safeError(error));
    }
    return listSessions(requestedCwd);
  });
  ipcMain.handle("sessions:pin", (_event, id: unknown, pinned: unknown) => setSessionPinned(expectString(id, "session id", 200), expectBoolean(pinned, "pinned")));
  ipcMain.handle("sessions:archive", (_event, id: unknown) => archiveSession(expectString(id, "session id", 200)));
  ipcMain.handle("sessions:unarchive", (_event, id: unknown) => unarchiveSession(expectString(id, "session id", 200)));
  ipcMain.handle("sessions:delete", async (_event, id: unknown) => {
    const sessionId = expectString(id, "session id", 200);
    if (!agentHost?.deleteSession) throw new Error("当前 Devin ACP 未提供 session/delete");
    await agentHost.deleteSession(sessionId);
    await removeSessionSummary(sessionId);
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

  ipcMain.handle("agent:start", async (_event, value: unknown) => {
    const options = expectAgentStartOptions(value);
    activeAgentCwd = options.cwd;
    if (options.project && options.cwd) await recentWorkspaces.touch(options.cwd);
    if (!agentHost?.start) throw new Error("Devin ACP runtime is not available. Install Devin CLI and restart the app.");
    return agentHost.start(options);
  });
  ipcMain.handle("agent:stop", () => agentHost?.stop?.());
  ipcMain.handle("agent:command", (_event, type: unknown, data: unknown) => {
    const command = expectString(type, "agent command", 100);
    if (!ALLOWED_AGENT_COMMANDS.has(command)) throw new Error(`Unsupported agent command: ${command}`);
    const payload = data === undefined ? undefined : expectRecord(data, "agent command data");
    if (!agentHost?.request && !agentHost?.command) throw new Error("Devin ACP runtime is not available");
    return agentHost.request?.(command, payload) ?? agentHost.command?.(command, payload);
  });
  ipcMain.handle("agent:ui-response", (_event, id: unknown, response: unknown) => {
    const requestId = expectString(id, "request id", 200);
    const data = expectRecord(response, "UI response");
    const pending = permissionRequests.get(requestId);
    if (pending) {
      permissionRequests.delete(requestId);
      const decision = permissionDecisionFromUi(data);
      const optionId = decision.outcome.outcome === "selected" ? decision.outcome.optionId : undefined;
      pending.resolve(optionId && pending.allowed.has(optionId) ? decision : { outcome: { outcome: "cancelled" } });
      return;
    }
    if (!agentHost?.respondToUi) throw new Error("Devin ACP runtime is not available");
    return agentHost.respondToUi(requestId, data);
  });
}

const ALLOWED_AGENT_COMMANDS = new Set(["prompt", "cancel", "abort", "follow_up", "new_session", "get_state", "set_model", "set_mode", "set_config_option", "get_available_models", "get_available_thinking_levels", "compact", "get_session_stats", "get_commands", "handoff", "reconnect"]);

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === "darwin") app.dock?.setIcon(developmentIconPath);
  await migrateDesktopData();
  recentWorkspaces = new RecentWorkspaces(path.join(app.getPath("userData"), "recent-workspaces.json"));
  appSettings = new AppSettings(appSettingsFile);
  configureSessionIndex(sessionIndexFile);
  agentHost = await createRuntimeHost();
  installFilePreviewProtocol();
  registerIpc();
  installMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => {
  for (const pending of permissionRequests.values()) pending.resolve(null);
  permissionRequests.clear();
  void agentHost?.stop?.();
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
function expectProfile(value: unknown): UserProfile {
  const profile = expectRecord(value, "profile");
  return { nickname: expectString(profile.nickname, "nickname", 60), ...(typeof profile.avatarDataUrl === "string" ? { avatarDataUrl: profile.avatarDataUrl } : {}) };
}
function expectModelIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("Invalid pinned model ids");
  return value.map((entry) => expectString(entry, "model id", 200));
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
