import { describe, expect, it, vi } from "vitest";
import {
  buildUpdateInvocation,
  checkDevinCliUpdate,
  installDevinCliUpdate,
  parseReleaseManifest,
} from "./devin-update";

describe("Devin CLI updates", () => {
  it("parses the official release manifest conservatively", () => {
    expect(parseReleaseManifest({ version: "3000.4.26", platforms: {} })).toBe("3000.4.26");
    expect(() => parseReleaseManifest({ version: "latest" })).toThrow("无效版本号");
    expect(() => parseReleaseManifest({ platforms: {} })).toThrow("缺少版本号");
  });

  it("compares the installed binary with the latest release", async () => {
    const status = await checkDevinCliUpdate("/tmp/devin", {
      fetchManifest: async () => ({ ok: true, status: 200, json: async () => ({ version: "3000.4.26" }) }),
      env: {},
      validateBinary: async (path) => ({ path, version: "3000.4.25", rawVersion: "Devin CLI 3000.4.25" }),
    });
    expect(status).toMatchObject({
      currentVersion: "3000.4.25",
      latestVersion: "3000.4.26",
      state: "available",
    });
  });

  it("builds shell-free macOS and Windows updater invocations", () => {
    expect(buildUpdateInvocation("darwin", "/Users/demo/bin/devin")).toEqual({
      command: "/usr/bin/script",
      args: ["-q", "/dev/null", "/Users/demo/bin/devin", "update"],
    });
    expect(buildUpdateInvocation("win32", "C:\\Devin\\devin.exe")).toEqual({
      command: "C:\\Devin\\devin.exe",
      args: ["update"],
    });
    expect(buildUpdateInvocation("linux", "/home/demo/Devin's bin/devin")).toEqual({
      command: "script",
      args: ["-q", "-e", "-c", "'/home/demo/Devin'\"'\"'s bin/devin' update", "/dev/null"],
    });
  });

  it("does not run the updater when the installed version is already current", async () => {
    const runUpdater = vi.fn(async () => "unused");
    const status = await installDevinCliUpdate("/tmp/devin", "3000.4.25", {
      runUpdater,
      validateBinary: async (path) => ({ path, version: "3000.4.25", rawVersion: "Devin CLI 3000.4.25" }),
    });
    expect(status.state).toBe("latest");
    expect(runUpdater).not.toHaveBeenCalled();
  });

  it("verifies the binary version after the official updater exits", async () => {
    const validateBinary = vi.fn()
      .mockResolvedValueOnce({ path: "/tmp/devin", version: "3000.4.25", rawVersion: "old" })
      .mockResolvedValueOnce({ path: "/tmp/devin", version: "3000.4.26", rawVersion: "new" });
    const runUpdater = vi.fn(async () => "Update complete");
    const status = await installDevinCliUpdate("/tmp/devin", "3000.4.26", {
      platform: "darwin",
      runUpdater,
      validateBinary,
    });
    expect(runUpdater).toHaveBeenCalledOnce();
    expect(status).toMatchObject({ currentVersion: "3000.4.26", state: "latest" });
  });

  it("does not claim success when a managed installation stays on the old version", async () => {
    const validateBinary = vi.fn().mockResolvedValue({ path: "/tmp/devin", version: "3000.4.25", rawVersion: "old" });
    await expect(installDevinCliUpdate("/tmp/devin", "3000.4.26", {
      platform: "darwin",
      runUpdater: async () => "This installation is managed by Homebrew. To update, run: brew upgrade devin",
      validateBinary,
    })).rejects.toThrow("brew upgrade devin");
  });
});
