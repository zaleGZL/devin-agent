import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { AcpTransport, type SpawnedProcessLike } from "./acp-transport";

class MockAcpProcess extends EventEmitter implements SpawnedProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 19001;
  readonly spawnOptions: Record<string, unknown>;

  constructor(spawnOptions: Record<string, unknown>) {
    super();
    this.spawnOptions = spawnOptions;
    this.stdin.on("data", (chunk) => this.handleRequest(chunk.toString()));
  }

  kill(): boolean {
    queueMicrotask(() => this.emit("exit", null, "SIGTERM"));
    return true;
  }

  private handleRequest(chunk: string): void {
    for (const line of chunk.split("\n").filter(Boolean)) {
      const request = JSON.parse(line) as { id: number; method: string };
      if (request.method === "initialize") {
        this.stdout.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: 1,
            agentCapabilities: {
              loadSession: true,
              promptCapabilities: { image: true, audio: false, embeddedContext: true },
              sessionCapabilities: { list: {}, delete: {}, close: {} },
              _meta: { fixture: "ok" },
            },
            authMethods: [],
            _meta: { unknownExtension: { enabled: true } },
          },
        })}\n`);
      }
    }
  }
}

describe("AcpTransport", () => {
  it("uses the official ACP SDK over stdio and exposes negotiated responses", async () => {
    let process: MockAcpProcess | undefined;
    const transport = new AcpTransport("/tmp/devin", {
      spawn: (_command, args, options) => {
        process = new MockAcpProcess({ args, ...options });
        return process;
      },
    });
    await transport.start();
    const result = await transport.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "fixture", version: "0.0.0" },
    });
    expect(result).toMatchObject({ protocolVersion: 1 });
    expect(process?.spawnOptions).toMatchObject({ shell: false, args: ["acp"] });
    await transport.stop();
  });

  it("rejects requests deterministically after a bounded timeout", async () => {
    const process = new MockAcpProcess({});
    const transport = new AcpTransport("/tmp/devin", {
      spawn: () => process,
      timeoutMs: 20,
    });
    await transport.start();
    await expect(transport.request("fixture/timeout", {}, { timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
    await transport.stop();
  });

  it("rejects pending requests when the ACP process exits and redacts stderr", async () => {
    const process = new MockAcpProcess({});
    const transport = new AcpTransport("/tmp/devin", { spawn: () => process, timeoutMs: 500 });
    await transport.start();
    process.stderr.write("token=private-value\n");
    const pending = transport.request("fixture/pending", {});
    queueMicrotask(() => process.emit("exit", 1, null));
    await expect(pending).rejects.toMatchObject({ code: "process-exited" });
    expect((await transport.waitForExit()).stderr).not.toContain("private-value");
  });

  it("terminates the child when an ACP frame exceeds the configured bound", async () => {
    const process = new MockAcpProcess({});
    const malformed: string[] = [];
    const transport = new AcpTransport("/tmp/devin", {
      spawn: () => process,
      maxFrameBytes: 16,
      onMalformedMessage: (message) => malformed.push(message),
    });
    await transport.start();
    process.stdout.write("x".repeat(17));
    const exit = await transport.waitForExit();
    expect(exit.error?.message).toContain("exceeds 16 bytes");
    expect(malformed[0]).toContain("frame rejected");
  });

  it("closes a malformed JSON connection instead of accepting an invalid response", async () => {
    const process = new MockAcpProcess({});
    const transport = new AcpTransport("/tmp/devin", { spawn: () => process, timeoutMs: 200 });
    await transport.start();
    const pending = transport.request("fixture/malformed", {});
    process.stdout.write("{not-json}\n");
    await expect(pending).rejects.toMatchObject({ code: expect.stringMatching(/process-exited|protocol/) });
    expect((await transport.waitForExit()).error).toBeInstanceOf(Error);
  });
});
