import { describe, expect, it } from "vitest";
import { resolvePreferredModeId } from "./mode-selection";

const modes = [
  { id: "code", name: "Code" },
  { id: "bypass-permissions", name: "Bypass Permissions" },
];

describe("resolvePreferredModeId", () => {
  it("uses the global preference when the runtime advertises it", () => {
    expect(resolvePreferredModeId("bypass-permissions", modes, "code")).toBe("bypass-permissions");
  });

  it("falls back to the runtime mode when the global preference is unavailable", () => {
    expect(resolvePreferredModeId("plan", modes, "code")).toBe("code");
  });

  it("falls back to the first advertised mode when neither choice is available", () => {
    expect(resolvePreferredModeId("plan", modes, "ask")).toBe("code");
  });
});
