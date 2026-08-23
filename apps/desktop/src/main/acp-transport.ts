import { isAbsolute } from "node:path";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { Readable, Transform, Writable, type Readable as ReadableStreamNode, type Writable as WritableStreamNode } from "node:stream";
import {
  client as createAcpClient,
  methods,
  ndJsonStream,
  type ClientConnection,
} from "@agentclientprotocol/sdk";
import { redactSensitive } from "../shared/acp-types";

export interface AcpSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxFrameBytes?: number;
  args?: string[];
  spawn?: SpawnFunction;
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (method: string, params: unknown, context?: { requestId: string | number | null }) => Promise<unknown> | unknown;
  onMalformedMessage?: (message: string) => void;
  onExit?: (result: AcpExitResult) => void;
}

export interface AcpExitResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  stderr: string;
}

export interface SpawnedProcessLike {
  pid?: number;
  stdin: WritableStreamNode | null;
  stdout: ReadableStreamNode | null;
  stderr: ReadableStreamNode | null;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell: false;
    stdio: ["pipe", "pipe", "pipe"];
    windowsHide: boolean;
    detached: false;
  },
) => SpawnedProcessLike;

export class AcpTransportError extends Error {
  readonly code:
    | "not-started"
    | "already-started"
    | "invalid-command"
    | "timeout"
    | "aborted"
    | "process-exited"
    | "protocol"
    | "closed"
    | "write";
  readonly details?: unknown;

  constructor(
    code: AcpTransportError["code"],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AcpTransportError";
    this.code = code;
    this.details = redactSensitive(details);
  }
}

export interface AcpRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;

/**
 * ACP v1 transport backed by the official `@agentclientprotocol/sdk`.
 *
 * The SDK owns JSON-RPC framing, request ids, schema validation and server
 * request routing. This wrapper adds Electron-specific process lifecycle,
 * bounded timeouts, diagnostics and a small generic request surface used by
 * `DevinAcpHost`.
 */
export class AcpTransport {
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly options: AcpSpawnOptions;
  private readonly timeoutMs: number;
  private readonly maxFrameBytes: number;
  private process: SpawnedProcessLike | null = null;
  private connection: ClientConnection | null = null;
  private started = false;
  private stopping = false;
  private exited = false;
  private stderr = "";
  private exitResult: AcpExitResult | null = null;
  private exitPromise: Promise<AcpExitResult> | null = null;
  private resolveExit: ((result: AcpExitResult) => void) | null = null;

  constructor(command: string, options: AcpSpawnOptions = {}) {
    this.command = command;
    this.args = options.args ?? ["acp"];
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  get pid(): number | undefined {
    return this.process?.pid;
  }

  get isRunning(): boolean {
    return this.started && !this.exited && this.process !== null && this.connection !== null;
  }

  get lastExit(): AcpExitResult | null {
    return this.exitResult;
  }

  get stderrText(): string {
    return String(redactSensitive(this.stderr));
  }

  async start(): Promise<void> {
    if (this.started && !this.exited) {
      throw new AcpTransportError("already-started", "ACP transport 已启动");
    }
    if (!isAbsolute(this.command)) {
      throw new AcpTransportError("invalid-command", "ACP command 必须是绝对路径");
    }

    const spawnImpl = this.options.spawn ?? defaultSpawn;
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(this.command, this.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
      });
    } catch (error) {
      throw new AcpTransportError("process-exited", "启动 Devin ACP 失败", error);
    }
    if (!child.stdin || !child.stdout) {
      child.kill("SIGTERM");
      throw new AcpTransportError("process-exited", "Devin ACP 未提供 stdio 管道");
    }

    this.process = child;
    this.started = true;
    this.stopping = false;
    this.exited = false;
    this.stderr = "";
    this.exitResult = null;
    this.exitPromise = new Promise<AcpExitResult>((resolve) => {
      this.resolveExit = resolve;
    });
    child.stderr?.on("data", (chunk) => this.appendStderr(chunk));
    child.once("error", (error) => this.handleExit({ code: null, signal: null, error }));
    child.once("exit", (code, signal) => this.handleExit({ code, signal }));
    // ChildProcess emits both `exit` and `close`; handle whichever arrives
    // first. `handleExit` is idempotent so mocks can emit both safely.
    child.once("close", (code, signal) => this.handleExit({ code, signal }));

    try {
      const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
      const boundedStdout = createBoundedNdjsonStream(this.maxFrameBytes);
      boundedStdout.once("error", (error) => {
        this.options.onMalformedMessage?.(`ACP frame rejected: ${safeErrorMessage(error)}`);
        child.kill("SIGTERM");
        this.handleExit({ code: null, signal: "SIGTERM", error: error instanceof Error ? error : new Error(String(error)) });
      });
      child.stdout.pipe(boundedStdout);
      const input = Readable.toWeb(boundedStdout) as ReadableStream<Uint8Array>;
      const stream = ndJsonStream(output, input);
      const sdkClient = createAcpClient({ name: "devin-desktop" });
      // The SDK's handlers receive a context object. Registering the standard
      // methods here ensures permission, elicitation and session updates are parsed and
      // answered by the official ACP implementation, not a hand-rolled JSON
      // RPC dispatcher.
      sdkClient.onRequest(methods.client.session.requestPermission, async (context) => {
        const result = await this.options.onRequest?.(methods.client.session.requestPermission, context.params, { requestId: context.requestId });
        return (result ?? { outcome: { outcome: "cancelled" } }) as never;
      });
      sdkClient.onRequest(methods.client.elicitation.create, async (context) => {
        const result = await this.options.onRequest?.(methods.client.elicitation.create, context.params, { requestId: context.requestId });
        return (result ?? { action: "cancel" }) as never;
      });
      sdkClient.onNotification(methods.client.session.update, async (context) => {
        this.options.onNotification?.(methods.client.session.update, context.params);
      });
      sdkClient.onNotification(methods.client.elicitation.complete, async (context) => {
        this.options.onNotification?.(methods.client.elicitation.complete, context.params);
      });
      // Preserve Devin extension notifications for diagnostics when an
      // extension chooses a known custom method. ACP unknown requests are
      // deliberately rejected by the SDK instead of being executed locally.
      this.connection = sdkClient.connect(stream);
      void this.connection.closed.then(() => {
        if (!this.exited && !this.stopping) {
          child.kill("SIGTERM");
          this.handleExit({ code: null, signal: null, error: new Error("ACP connection closed") });
        }
      });
    } catch (error) {
      this.handleExit({ code: null, signal: null, error: error instanceof Error ? error : new Error(String(error)) });
      throw new AcpTransportError("protocol", "初始化 ACP SDK transport 失败", error);
    }
  }

  async request<TResult = unknown>(
    method: string,
    params?: unknown,
    requestOptions: AcpRequestOptions = {},
  ): Promise<TResult> {
    if (!this.isRunning || !this.connection) {
      throw new AcpTransportError("not-started", "ACP transport 未启动");
    }
    if (requestOptions.signal?.aborted) {
      throw new AcpTransportError("aborted", `ACP 请求已取消：${method}`);
    }
    const cancellationController = new AbortController();
    const onAbort = () => cancellationController.abort(requestOptions.signal?.reason);
    requestOptions.signal?.addEventListener("abort", onAbort, { once: true });
    const timeoutMs = requestOptions.timeoutMs ?? this.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = this.connection.agent.request(method, params, {
        cancellationSignal: cancellationController.signal,
      });
      if (timeoutMs <= 0) return (await operation) as TResult;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancellationController.abort();
          reject(new AcpTransportError("timeout", `ACP 请求超时：${method}`));
        }, timeoutMs);
      });
      return (await Promise.race([operation, timeout])) as TResult;
    } catch (error) {
      if (requestOptions.signal?.aborted) {
        throw new AcpTransportError("aborted", `ACP 请求已取消：${method}`);
      }
      if (error instanceof AcpTransportError) throw error;
      if (this.exited) {
        throw new AcpTransportError("process-exited", `Devin ACP 进程在请求完成前退出：${method}`, error);
      }
      throw new AcpTransportError("protocol", `ACP 请求失败：${method}`, error);
    } finally {
      if (timer) clearTimeout(timer);
      requestOptions.signal?.removeEventListener("abort", onAbort);
    }
  }

  notify(method: string, params?: unknown): void {
    if (!this.isRunning || !this.connection) {
      throw new AcpTransportError("not-started", "ACP transport 未启动");
    }
    void this.connection.agent.notify(method, params).catch((error) => {
      if (!this.stopping) this.options.onMalformedMessage?.(`ACP notification 失败：${safeErrorMessage(error)}`);
    });
  }

  async waitForExit(): Promise<AcpExitResult> {
    if (this.exitResult) return this.exitResult;
    if (!this.exitPromise) return { code: null, signal: null, stderr: this.stderr };
    return this.exitPromise;
  }

  async stop(options: { graceMs?: number; killMs?: number } = {}): Promise<AcpExitResult> {
    if (!this.process || this.exited) {
      return this.exitResult ?? { code: null, signal: null, stderr: this.stderr };
    }
    this.stopping = true;
    const closeError = new AcpTransportError("closed", "ACP transport 已关闭");
    this.connection?.close(closeError);
    try {
      this.process.stdin?.end();
    } catch {
      // stdin may already be closed by the CLI.
    }
    const graceMs = options.graceMs ?? 1_000;
    const killMs = options.killMs ?? 1_000;
    this.process.kill("SIGTERM");
    await this.waitForExitWithin(graceMs);
    if (!this.exited) {
      this.process.kill("SIGKILL");
      await this.waitForExitWithin(killMs);
    }
    return this.exitResult ?? { code: null, signal: "SIGKILL", stderr: this.stderr };
  }

  private handleExit(result: Omit<AcpExitResult, "stderr">): void {
    if (this.exited) return;
    this.exited = true;
    const exitResult: AcpExitResult = { ...result, stderr: String(redactSensitive(this.stderr)) };
    this.exitResult = exitResult;
    try {
      this.connection?.close(new AcpTransportError("process-exited", "Devin ACP 进程已退出", exitResult));
    } catch {
      // Connection may already have closed itself.
    }
    this.options.onExit?.(exitResult);
    this.resolveExit?.(exitResult);
    this.resolveExit = null;
    this.process = null;
    this.connection = null;
  }

  private appendStderr(chunk: Buffer | string): void {
    if (this.stderr.length >= 16_384) return;
    const text = chunk.toString();
    this.stderr = `${this.stderr}${text.slice(0, 16_384 - this.stderr.length)}`;
  }

  private async waitForExitWithin(timeoutMs: number): Promise<void> {
    if (this.exited || !this.exitPromise) return;
    await Promise.race([
      this.exitPromise.then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell: false;
    stdio: ["pipe", "pipe", "pipe"];
    windowsHide: boolean;
    detached: false;
  },
): SpawnedProcessLike {
  return nodeSpawn(command, [...args], options) as ChildProcess & SpawnedProcessLike;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, " ").slice(0, 256);
  return "unknown error";
}

function createBoundedNdjsonStream(maxFrameBytes: number): Transform {
  let pending = Buffer.alloc(0);
  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pending = Buffer.concat([pending, buffer]);
      let newline = pending.indexOf(0x0a);
      while (newline >= 0) {
        const frame = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        if (frame.length > maxFrameBytes) {
          callback(new AcpTransportError("protocol", `ACP frame exceeds ${maxFrameBytes} bytes`));
          return;
        }
        if (frame.toString("utf8").trim()) {
          try {
            JSON.parse(frame.toString("utf8"));
          } catch {
            callback(new AcpTransportError("protocol", "ACP emitted malformed JSON"));
            return;
          }
        }
        this.push(Buffer.concat([frame, Buffer.from("\n")]));
        newline = pending.indexOf(0x0a);
      }
      if (pending.length > maxFrameBytes) {
        callback(new AcpTransportError("protocol", `ACP frame exceeds ${maxFrameBytes} bytes`));
        return;
      }
      callback();
    },
    flush(callback) {
      if (pending.toString("utf8").trim()) callback(new AcpTransportError("protocol", "ACP connection closed with an incomplete frame"));
      else callback();
    },
  });
}
