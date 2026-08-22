import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPathInside,
  isSafeExternalUrl,
  SECURE_RENDERER_WEB_PREFERENCES,
  validateIpcRecord,
  validateIpcString,
} from "./desktop-security";

describe("Electron security boundary", () => {
  it("keeps Node out of the renderer", () => {
    expect(SECURE_RENDERER_WEB_PREFERENCES).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });
  });

  it("keeps the sandboxed preload free of Node built-in imports", () => {
    const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
    expect([...preloadSource.matchAll(/from\s+["'](node:[^"']+)["']/g)].map((match) => match[1])).toEqual([]);
    expect(preloadSource).toContain('ipcRenderer.invoke("app:home-directory")');
  });

  it("opens only explicit HTTP(S) external links", () => {
    expect(isSafeExternalUrl("https://docs.devin.ai/cli")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000")).toBe(true);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects traversal and absolute paths outside the workspace", () => {
    const root = path.resolve("/workspace/project");
    expect(isPathInside(root, path.join(root, "src", "index.ts"))).toBe(true);
    expect(isPathInside(root, path.resolve(root, "..", "secret"))).toBe(false);
  });

  it("rejects malformed IPC payload primitives", () => {
    expect(validateIpcString("devin", "provider", 20)).toBe("devin");
    expect(() => validateIpcString("", "provider", 20)).toThrow(/Invalid provider/);
    expect(validateIpcRecord({ modeId: "smart" }, "command")).toEqual({ modeId: "smart" });
    expect(() => validateIpcRecord([], "command")).toThrow(/Invalid command/);
  });
});
