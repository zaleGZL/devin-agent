import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../shared/acp-types";
import { AcpTransport, type AcpExitResult, type AcpSpawnOptions } from "./acp-transport";
import { DevinAcpHost } from "./devin-acp-host";

const initializeResult = {
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    promptCapabilities: { image: true, audio: false, embeddedContext: true },
    sessionCapabilities: { list: {}, delete: {}, additionalDirectories: {} },
    _meta: {
      "cognition.ai/terminalLifecycle": true,
      "cognition.ai/editableCommands": true,
      "cognition.ai/commandRevision": true,
      "cognition.ai/chains": true,
      "cognition.ai/sessionRename": true,
    },
  },
  authMethods: [{ id: "devin-browser", name: "Browser" }],
  _meta: { unknownFixtureExtension: { enabled: true } },
};

class FakeTransport {
  isRunning = false;
  emitHistoryDuringLoad = false;
  emitHistoryDuringNew = false;
  deferPrompts = false;
  private readonly promptResolvers: Array<(value: JsonObject) => void> = [];
  requests: Array<{ method: string; params: unknown; options?: unknown }> = [];
  notifications: Array<{ method: string; params: unknown }> = [];

  constructor(readonly options: AcpSpawnOptions) {}

  async start(): Promise<void> { this.isRunning = true; }

  async request<T>(method: string, params?: unknown, options?: unknown): Promise<T> {
    this.requests.push({ method, params, options });
    if (method === "initialize") return initializeResult as T;
    if (method === "authenticate") return { url: "https://app.devin.ai/login" } as T;
    if (method === "session/new" || method === "session/load") {
      const record = params as Record<string, unknown>;
      if (method === "session/new" && this.emitHistoryDuringNew) {
        this.emitUpdate({ sessionId: "new-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "new session update" } } });
      }
      if (method === "session/load" && this.emitHistoryDuringLoad) {
        this.emitUpdate({ sessionId: String(record.sessionId), update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "restored history" } } });
      }
      return {
        sessionId: method === "session/load" ? record.sessionId : "new-session",
        modes: { currentModeId: "accept-edits", availableModes: [{ id: "accept-edits", name: "Code" }] },
        configOptions: [{ id: "model", currentValue: "adaptive", options: [{ value: "adaptive", _meta: { "cognition.ai/supportsImages": true } }] }],
      } as T;
    }
    if (method === "session/list") return { sessions: [{ sessionId: "listed", cwd: "/workspace", _meta: { "cognition.ai/isLocked": true } }] } as T;
    if (method === "session/prompt") {
      if (this.deferPrompts) return new Promise<JsonObject>((resolve) => this.promptResolvers.push(resolve)) as Promise<T>;
      return { stopReason: "end_turn" } as T;
    }
    if (method === "_cognition.ai/command/revise") return { command: "touch revised.txt" } as T;
    if (method === "_cognition.ai/session/rename") return { title: (params as Record<string, unknown>).title } as T;
    return {} as T;
  }

  notify(method: string, params?: unknown): void { this.notifications.push({ method, params }); }

  async stop(): Promise<AcpExitResult> {
    this.isRunning = false;
    return { code: 0, signal: null, stderr: "" };
  }

  emitUpdate(params: JsonObject): void { this.options.onNotification?.("session/update", params); }
  emitExit(): void { this.isRunning = false; this.options.onExit?.({ code: 1, signal: null, stderr: "token=[REDACTED]" }); }
  requestPermission(params: JsonObject): Promise<unknown> { return Promise.resolve(this.options.onRequest?.("session/request_permission", params)); }
  resolvePrompt(): void { this.promptResolvers.shift()?.({ stopReason: "end_turn" }); }
}

function createHost(overrides: Partial<ConstructorParameters<typeof DevinAcpHost>[0]> = {}) {
  const transports: FakeTransport[] = [];
  const host = new DevinAcpHost({
    binaryPath: process.execPath,
    cwd: "/workspace",
    transportFactory: (_command, options) => {
      const transport = new FakeTransport(options);
      transports.push(transport);
      return transport as unknown as AcpTransport;
    },
    ...overrides,
  });
  return { host, transports };
}

describe("DevinAcpHost contract", () => {
  it("shares one initialize operation across concurrent callers", async () => {
    const { host, transports } = createHost();
    const [first, second] = await Promise.all([host.start(), host.start()]);
    expect(first).toBe(second);
    expect(transports).toHaveLength(1);
    expect(transports[0]?.requests.filter((request) => request.method === "initialize")).toHaveLength(1);
    expect(transports[0]?.requests.find((request) => request.method === "initialize")?.params).toMatchObject({
      clientCapabilities: {
        elicitation: { form: {}, url: {} },
        _meta: {
          "cognition.ai/editableCommands": true,
          "cognition.ai/commandRevision": true,
          "cognition.ai/chains": true,
        },
      },
    });
    await host.stop();
  });

  it("negotiates unknown extensions and creates/loads sessions with absolute cwd", async () => {
    const { host, transports } = createHost();
    const capabilities = await host.start();
    expect(capabilities).toMatchObject({ protocolVersion: 1, supportsLoadSession: true });
    expect(capabilities.extensions).toMatchObject({ unknownFixtureExtension: { enabled: true } });
    const session = await host.newSession("/workspace", { additionalDirectories: ["/shared"] });
    expect(session.sessionId).toBe("new-session");
    expect(transports[0]?.requests.find((request) => request.method === "session/new")?.params).toMatchObject({ cwd: "/workspace", additionalDirectories: ["/shared"] });
    await host.loadSession("saved-session", { cwd: "/workspace" });
    expect(host.sessionId).toBe("saved-session");
    await host.stop();
  });

  it("uses advertised browser auth without exposing credentials", async () => {
    const opened: string[] = [];
    const { host } = createHost({ openExternal: (url) => { opened.push(url); } });
    await host.start();
    await host.authenticate();
    expect(opened).toEqual(["https://app.devin.ai/login"]);
    await host.stop();
  });

  it("returns renderer permission choices and keeps tool execution in Devin", async () => {
    const permission = vi.fn(async () => "allow-once");
    const { host, transports } = createHost({ onPermissionRequest: permission });
    await host.start();
    await host.newSession("/workspace");
    const result = await transports[0]?.requestPermission({ sessionId: "new-session", options: [{ optionId: "allow-once" }] });
    expect(permission).toHaveBeenCalledOnce();
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    await host.stop();
  });

  it("uses verified allowlisted Devin methods for side chat, revision and native rename", async () => {
    const { host, transports } = createHost();
    await host.start();
    await host.newSession("/workspace");
    await expect(host.sideChat("quick question")).resolves.toEqual({ stopReason: "end_turn" });
    await expect(host.reviseCommand({ command: "touch original.txt", instruction: "change the filename" })).resolves.toEqual({ command: "touch revised.txt" });
    await expect(host.renameSession("new-session", "Native title")).resolves.toEqual({ title: "Native title" });
    expect(transports[0]?.requests.find((request) => request.method === "session/prompt")?.params).toMatchObject({
      prompt: [{ type: "text", text: "quick question" }],
      _meta: { "cognition.ai/chain": "side" },
    });
    expect(transports[0]?.requests.find((request) => request.method === "_cognition.ai/command/revise")?.params).toMatchObject({ command: "touch original.txt", note: "change the filename" });
    expect(transports[0]?.requests.find((request) => request.method === "_cognition.ai/session/rename")?.params).toMatchObject({ sessionId: "new-session", title: "Native title" });
    await host.stop();
  });

  it("gates absent session operations and locked deletion", async () => {
    const { host } = createHost();
    await host.start();
    await expect(host.resumeSession("session", { cwd: "/workspace" })).rejects.toMatchObject({ code: "capability" });
    await expect(host.deleteSession("locked", { sessionId: "locked", _meta: { isLocked: true } })).rejects.toMatchObject({ code: "locked" });
    await host.stop();
  });

  it("lists/deletes advertised sessions and switches without interrupting sibling sessions", async () => {
    const { host, transports } = createHost();
    await host.start();
    await host.newSession("/workspace");
    const listed = await host.listSessions({ cwd: "/workspace" });
    expect(listed.sessions[0]).toMatchObject({ sessionId: "listed", _meta: { "cognition.ai/isLocked": true } });
    await host.deleteSession("deletable", { sessionId: "deletable", cwd: "/workspace" });
    expect(transports[0]?.requests.some((request) => request.method === "session/delete")).toBe(true);

    await host.switchSession("saved-session", { cwd: "/workspace" });
    expect(transports).toHaveLength(1);
    expect(transports[0]?.notifications).not.toContainEqual({ method: "session/cancel", params: { sessionId: "new-session" } });
    expect(transports[0]?.requests.some((request) => request.method === "session/load")).toBe(true);
    await host.stop();
  });

  it("keeps a prompt running when another session becomes active", async () => {
    const { host, transports } = createHost();
    await host.start();
    await host.newSession("/workspace");
    transports[0]!.deferPrompts = true;

    const prompt = host.prompt("keep working", "new-session");
    await Promise.resolve();
    expect(host.runningSessionIds).toContain("new-session");
    await host.switchSession("saved-session", { cwd: "/workspace" });

    expect(host.sessionId).toBe("saved-session");
    expect(host.runningSessionIds).toContain("new-session");
    expect(transports[0]?.notifications).not.toContainEqual({ method: "session/cancel", params: { sessionId: "new-session" } });
    transports[0]!.resolvePrompt();
    await prompt;
    expect(host.runningSessionIds).not.toContain("new-session");
    await host.stop();
  });

  it("does not apply the generic transport timeout to a running prompt", async () => {
    const { host, transports } = createHost({ requestTimeoutMs: 10 });
    await host.start();
    await host.newSession("/workspace");

    await host.prompt("long-running task", "new-session");

    expect(transports[0]?.requests.find((request) => request.method === "session/prompt")?.options)
      .toMatchObject({ timeoutMs: 0 });
    await host.stop();
  });

  it("forwards ACP embedded resources and resource links without flattening them", async () => {
    const { host, transports } = createHost();
    await host.start();
    await host.newSession("/workspace");
    const content = [
      { type: "text" as const, text: "review" },
      { type: "resource" as const, resource: { uri: "file:///workspace/src/app.ts", mimeType: "text/typescript", text: "export {};" } },
      { type: "resource_link" as const, uri: "file:///workspace/docs", name: "@docs/", description: "Workspace directory" },
    ];

    await host.prompt(content, "new-session");

    expect(transports[0]?.requests.find((request) => request.method === "session/prompt")?.params)
      .toEqual({ sessionId: "new-session", prompt: content });
    await host.stop();
  });

  it("accepts history updates emitted before session/load returns", async () => {
    const updates = vi.fn();
    const diagnostics = vi.fn();
    const { host, transports } = createHost({ onUpdate: updates, onDiagnostic: diagnostics });
    await host.start();
    await host.newSession("/workspace");
    transports[0]!.emitHistoryDuringLoad = true;
    await host.loadSession("saved-session", { cwd: "/workspace" });

    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "saved-session",
      update: expect.objectContaining({ sessionUpdate: "agent_message_chunk" }),
    }));
    expect(diagnostics).not.toHaveBeenCalledWith(expect.objectContaining({ code: "stale-event" }));
    await host.stop();
  });

  it("accepts updates emitted before session/new returns its generated id", async () => {
    const updates = vi.fn();
    const diagnostics = vi.fn();
    const { host, transports } = createHost({ onUpdate: updates, onDiagnostic: diagnostics });
    await host.start();
    transports[0]!.emitHistoryDuringNew = true;

    await host.newSession("/workspace");

    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "new-session" }));
    expect(diagnostics).not.toHaveBeenCalledWith(expect.objectContaining({ code: "stale-event" }));
    await host.stop();
  });

  it("isolates stale updates and surfaces process exit as a reconnectable error state", async () => {
    const updates = vi.fn();
    const states: string[] = [];
    const { host, transports } = createHost({ onUpdate: updates, onStateChange: (state) => states.push(state) });
    await host.start();
    await host.newSession("/workspace");
    transports[0]?.emitUpdate({ sessionId: "other-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "stale" } } });
    expect(updates).not.toHaveBeenCalled();
    transports[0]?.emitExit();
    expect(states.at(-1)).toBe("error");
  });
});
