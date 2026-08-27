import type { DesktopApi } from "../shared/types";

const workspace = "/Users/demo/projects/devin-agent";
const docsWorkspace = "/Users/demo/projects/developer-docs";
const terminalWorkspace = "/Users/demo/projects/termany";
const generalTasksWorkspace = "/Users/demo/Library/Application Support/Devin Agent/tasks";
const previewNow = new Date().toISOString();
let pinnedModelIds: string[] = [];
let newSessionModelId: string | null = null;
let preferredModeId: string | null = null;

function previewSession(id: string, title: string, ageMs: number, messageCount: number, cwd = workspace) {
  const sessionPath = `preview-session-${id}`;
  return {
    path: sessionPath,
    storagePath: sessionPath,
    id,
    cwd,
    title,
    createdAt: previewNow,
    updatedAt: new Date(Date.now() - ageMs).toISOString(),
    model: "adaptive",
    messageCount,
    pinned: false,
    archived: false,
  };
}

export function createPreviewApi(): DesktopApi {
  const weixinConnected = new URLSearchParams(window.location.search).get("weixin") === "connected";
  return {
    platform: "darwin",
    app: {
      version: async () => "0.1.0-preview",
      homeDirectory: async () => "/Users/demo",
      openExternal: async () => undefined,
      copyText: async () => undefined,
      saveMarkdown: async () => ({ saved: false }),
    },
    settings: {
      getColorScheme: async () => "system",
      setColorScheme: async () => undefined,
      getLanguage: async () => "system",
      setLanguage: async () => undefined,
      getProfile: async () => ({ nickname: "demo" }),
      setProfile: async () => undefined,
      getShowReasoningProcess: async () => false,
      setShowReasoningProcess: async () => undefined,
      getPinnedModelIds: async () => [...pinnedModelIds],
      setPinnedModelIds: async (modelIds) => { pinnedModelIds = [...modelIds]; },
      getNewSessionModelId: async () => newSessionModelId,
      setNewSessionModelId: async (modelId) => { newSessionModelId = modelId; },
      getPreferredModeId: async () => preferredModeId,
      setPreferredModeId: async (modeId) => { preferredModeId = modeId; },
      getDevinCliPath: async () => "/Users/demo/.local/bin/devin",
      setDevinCliPath: async (binaryPath) => ({ id: "devin", name: "Devin CLI", configured: true, source: "external-cli", defaultModel: "", version: "3000.4.25", binaryPath: binaryPath ?? "/Users/demo/.local/bin/devin", authenticated: "unknown" }),
      chooseDevinCliPath: async () => ({ id: "devin", name: "Devin CLI", configured: true, source: "external-cli", defaultModel: "", version: "3000.4.25", binaryPath: "/Users/demo/.local/bin/devin", authenticated: "unknown" }),
      getDevinCliUpdateStatus: async () => ({ currentVersion: "3000.4.25", latestVersion: "3000.4.26", state: "available", checkedAt: new Date().toISOString() }),
      updateDevinCli: async () => ({ currentVersion: "3000.4.26", latestVersion: "3000.4.26", state: "latest", checkedAt: new Date().toISOString() }),
    },
    workspace: {
      choose: async () => workspace,
      recent: async () => [
        { path: workspace, name: "devin-agent", lastOpenedAt: new Date().toISOString() },
        { path: docsWorkspace, name: "developer-docs", lastOpenedAt: new Date(Date.now() - 3_600_000).toISOString() },
        { path: terminalWorkspace, name: "termany", lastOpenedAt: new Date(Date.now() - 7_200_000).toISOString() },
      ],
      forget: async () => [],
      openInDevin: async () => undefined,
      changes: async (workspacePath) => ({
        workspacePath,
        repositoryRoot: workspacePath,
        branch: "main",
        isRepository: true,
        checkedAt: previewNow,
        changes: [
          { path: "apps/desktop/src/renderer/App.tsx", kind: "modified", indexStatus: " ", workingTreeStatus: "M", staged: false, unstaged: true },
          { path: "docs/changes.md", kind: "untracked", indexStatus: "?", workingTreeStatus: "?", staged: false, unstaged: true },
        ],
      }),
      diff: async (_workspacePath, filePath) => ({
        change: { path: filePath, kind: "modified", indexStatus: " ", workingTreeStatus: "M", staged: false, unstaged: true },
        content: `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n@@ -1,2 +1,2 @@\n-old value\n+new value`,
        binary: false,
        truncated: false,
      }),
      reorder: async (paths) => paths.flatMap((projectPath) => {
        const item = [
          { path: workspace, name: "devin-agent", lastOpenedAt: new Date().toISOString() },
          { path: docsWorkspace, name: "developer-docs", lastOpenedAt: new Date(Date.now() - 3_600_000).toISOString() },
          { path: terminalWorkspace, name: "termany", lastOpenedAt: new Date(Date.now() - 7_200_000).toISOString() },
        ].find((candidate) => candidate.path === projectPath);
        return item ? [item] : [];
      }),
      rename: async (projectPath, name) => [
        { path: workspace, name: projectPath === workspace ? name : "devin-agent", lastOpenedAt: new Date().toISOString() },
        { path: docsWorkspace, name: projectPath === docsWorkspace ? name : "developer-docs", lastOpenedAt: new Date(Date.now() - 3_600_000).toISOString() },
        { path: terminalWorkspace, name: projectPath === terminalWorkspace ? name : "termany", lastOpenedAt: new Date(Date.now() - 7_200_000).toISOString() },
      ],
    },
    files: {
      validPreviewPaths: async (paths) => paths,
      choosePreview: async () => ({
        id: "preview-readme",
        path: `${workspace}/README.md`,
        name: "README.md",
        extension: "md",
        kind: "markdown",
        url: "",
        size: 842,
        modifiedAt: previewNow,
        content: "# Devin Agent Desktop\n\nA native workspace for building, reviewing, and previewing changes with Devin Agent.\n\n- Shared Devin Agent runtime\n- Local project sessions\n- Rich file previews",
      }),
      preview: async (filePath) => ({
        id: "preview-file",
        path: filePath,
        name: filePath.split("/").at(-1) ?? "Preview",
        extension: filePath.split(".").at(-1) ?? "txt",
        kind: "code",
        url: "",
        size: 128,
        modifiedAt: previewNow,
        content: "// File preview\nexport const ready = true;",
      }),
      openPreview: async () => undefined,
    },
    mentions: {
      setWorkspace: async () => undefined,
      search: async () => [],
      skills: async () => [],
    },
    sessions: {
      list: async () => [
        previewSession("1", "Add desktop workspace support", 0, 4),
        previewSession("4", "Build collapsible project navigation", 3_600_000, 7),
        previewSession("5", "Review the RPC event flow", 10_800_000, 9),
        previewSession("6", "Fix authentication settings", 21_600_000, 6),
        previewSession("7", "Polish the composer layout", 32_400_000, 5),
        previewSession("8", "Prepare the desktop release", 43_200_000, 8),
        previewSession("9", "Document the desktop architecture", 14_400_000, 5, docsWorkspace),
        previewSession("10", "Publish developer documentation", 28_800_000, 4, docsWorkspace),
        previewSession("11", "Improve terminal session restore", 18_000_000, 6, terminalWorkspace),
        previewSession("2", "Compare two implementation options", 7_200_000, 9, generalTasksWorkspace),
        previewSession("3", "Plan the next release", 86_400_000, 6, generalTasksWorkspace),
      ],
      pin: async () => true,
      reorder: async () => true,
      rename: async (id, title) => previewSession(id, title, 0, 1),
      archive: async () => undefined,
      unarchive: async () => undefined,
      delete: async () => undefined,
    },
    auth: {
      status: async () => [{ id: "devin", name: "Devin CLI", configured: true, source: "external-cli", defaultModel: "", version: "3000.4.25", authenticated: "unknown" }],
      saveApiKey: async () => undefined,
      login: async () => true,
      respond: async () => undefined,
      logout: async () => undefined,
      onEvent: () => () => undefined,
    },
    agent: {
      start: async (options) => ({
        state: { isStreaming: false, model: { provider: "devin", id: "adaptive" }, modeId: "accept-edits" },
        messages: options.sessionPath ? [
          { role: "user", content: [{ type: "text", text: "Inspect this workspace and make the desktop experience feel native." }], timestamp: Date.now() - 65_000 },
          { role: "assistant", content: [
            { type: "thinking", thinking: "I’ll inspect the shared runtime boundary and keep the Electron host thin." },
            { type: "text", text: "I’ll inspect the ACP runtime boundary first, then verify how the desktop shell connects to it." },
            { type: "toolCall", id: "preview-tool", name: "exec_command", arguments: { cmd: "rg --files apps/desktop/src" } },
          ], timestamp: Date.now() - 55_000 },
          { role: "toolResult", toolCallId: "preview-tool", toolName: "exec_command", content: [{ type: "text", text: "apps/desktop/src/main/devin-acp-host.ts" }], isError: false, timestamp: Date.now() - 53_000 },
          { role: "assistant", content: [
            { type: "toolCall", id: "preview-plan", name: "update_plan", arguments: { plan: [
              { step: "Inspect the shared runtime boundary", status: "completed" },
              { step: "Connect the desktop session lifecycle", status: "in_progress" },
              { step: "Verify native workspace behavior", status: "pending" },
            ] } },
          ], timestamp: Date.now() - 52_500 },
          { role: "toolResult", toolCallId: "preview-plan", toolName: "update_plan", content: [{ type: "text", text: "Plan updated: 1/3 steps completed." }], isError: false, timestamp: Date.now() - 52_200 },
          { role: "assistant", content: [
            { type: "thinking", thinking: "I’ve verified the boundary and can now summarize the architecture." },
            { type: "text", text: "The desktop shell is connected to the external Devin CLI over ACP.\n\nThe host owns native window behavior, secure IPC, and workspace selection; Devin owns tools and policy." },
          ], timestamp: Date.now() - 52_000 },
        ] : [],
        models: [
          { provider: "devin", id: "adaptive", reasoning: true },
        ],
        thinkingLevels: ["low", "high", "max"],
      }),
      stop: async () => undefined,
      command: async <T = unknown>() => undefined as T,
      respondToUi: async () => undefined,
      onEvent: () => () => undefined,
      onError: () => () => undefined,
    },
    weixin: {
      getStatus: async () => ({
        state: weixinConnected ? "online" : "workspace-ready",
        workspacePath: workspace,
        accountId: weixinConnected ? "preview-account" : undefined,
        online: weixinConnected,
        autoLaunch: false,
        running: false,
        mediaBytes: 0,
        modelId: "adaptive",
        modeId: "accept-edits",
      }),
      chooseWorkspace: async () => workspace,
      configureWorkspace: async () => undefined,
      chooseAttachments: async () => [],
      startLogin: async () => ({
        sessionId: "preview-login",
        qrContent: "preview",
        qrImageDataUrl: "data:image/png;base64,",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      }),
      waitLogin: async () => ({ state: "waiting", message: "等待扫码" }),
      submitVerifyCode: async () => undefined,
      start: async () => undefined,
      pause: async () => undefined,
      disconnect: async () => undefined,
      getHistory: async () => ({ messages: [], hasMore: false }),
      send: async () => undefined,
      abortTurn: async () => undefined,
      setAutoLaunch: async () => undefined,
      clearAllData: async () => undefined,
      onEvent: () => () => undefined,
    },
    telegram: {
      getStatus: async () => ({
        state: "workspace-ready",
        workspacePath: workspace,
        online: false,
        autoLaunch: false,
        running: false,
        mediaBytes: 0,
        modelId: "adaptive",
        modeId: "accept-edits",
        models: [{ provider: "devin", id: "adaptive" }],
        modes: [{ id: "accept-edits", name: "Accept Edits" }],
      }),
      chooseWorkspace: async () => workspace,
      configureWorkspace: async () => undefined,
      chooseAttachments: async () => [],
      saveToken: async () => undefined,
      start: async () => undefined,
      pause: async () => undefined,
      disconnect: async () => undefined,
      getHistory: async () => ({ messages: [], hasMore: false }),
      send: async () => undefined,
      abortTurn: async () => undefined,
      setAutoLaunch: async () => undefined,
      clearAllData: async () => undefined,
      onEvent: () => () => undefined,
    },
  };
}
