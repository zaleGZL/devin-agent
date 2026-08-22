import { describe, expect, it } from "vitest";
import { collectCandidates, compareVersions, parseDevinVersion, validateDevinBinary } from "./devin-discovery";

describe("Devin CLI discovery helpers", () => {
  it("parses the current CLI version format without logging the build hash", () => {
    expect(parseDevinVersion("Devin CLI 3000.4.25 (7e8e528a)\n")).toBe("3000.4.25");
  });

  it("compares numeric versions and pre-release suffixes conservatively", () => {
    expect(compareVersions("3000.4.25", "3000.4.24")).toBe(1);
    expect(compareVersions("3000.4.25", "3000.4.25")).toBe(0);
    expect(compareVersions("3000.4.24", "3000.4.25")).toBe(-1);
  });

  it("orders a user path before PATH and common locations", () => {
    const candidates = collectCandidates({
      configuredPath: "/tmp/custom/devin",
      pathValue: "/opt/devin/bin:/usr/local/bin",
      platform: "darwin",
      homeDirectory: "/Users/example",
    });
    expect(candidates[0]).toEqual({ path: "/tmp/custom/devin", source: "configured" });
    expect(candidates[1]).toEqual({ path: "/opt/devin/bin/devin", source: "path" });
    expect(candidates.some((candidate) => candidate.path === "/opt/homebrew/bin/devin")).toBe(true);
  });

  it("requires an absolute executable path and supports deterministic version probes", async () => {
    await expect(validateDevinBinary("devin", { runVersion: async () => "3000.4.25" })).rejects.toMatchObject({
      code: "not-absolute",
    });
    const info = await validateDevinBinary(process.execPath, {
      runVersion: async () => "Devin CLI 3000.4.25 (private-build)",
    });
    expect(info.path).toBe(process.execPath);
    expect(info.version).toBe("3000.4.25");
  });
});
