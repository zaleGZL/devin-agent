import { describe, expect, it } from "vitest";
import {
  buildAgentSnapshot,
  mapRuntimeSessionSummary,
  permissionDecisionFromUi,
  platformSandboxDiagnostic,
  resolveRuntimeSessionOpenAction,
} from "./runtime-adapter";

describe("runtime adapter", () => {
  it("replays a transcript when the renderer has lost its local session history", () => {
    expect(resolveRuntimeSessionOpenAction("session-a", "session-a", true, true)).toBe("load");
    expect(resolveRuntimeSessionOpenAction("session-a", "session-b", true, true)).toBe("load");
    expect(resolveRuntimeSessionOpenAction("session-a", "session-a", true, false)).toBe("reuse");
    expect(resolveRuntimeSessionOpenAction("session-a", "session-b", true, false)).toBe("switch");
  });

  it("builds model and mode selectors only from the current session response", () => {
    const snapshot = buildAgentSnapshot({
      raw: {
        protocolVersion: 1,
        agentCapabilities: { promptCapabilities: { image: true, audio: false }, loadSession: true },
      },
    }, {
      sessionId: "session-1",
      cwd: "/workspace",
      modes: { currentModeId: "smart", availableModes: [{ id: "smart", name: "Smart" }, { id: "plan", name: "Plan" }] },
      configOptions: [{
        id: "model",
        type: "select",
        currentValue: "model-a",
        options: [
          { value: "model-a", name: "Model A", _meta: { "cognition.ai/supportsImages": true } },
          { value: "model-b", name: "Model B" },
        ],
      }],
    });

    expect(snapshot.state).toMatchObject({ model: { provider: "devin", id: "model-a" }, modeId: "smart" });
    expect(snapshot.models).toEqual([
      expect.objectContaining({ id: "model-a", supportsImages: true }),
      expect.objectContaining({ id: "model-b", supportsImages: false }),
    ]);
    expect(snapshot.modes).toEqual([
      expect.objectContaining({ id: "smart", name: "Smart" }),
      expect.objectContaining({ id: "plan", name: "Plan" }),
    ]);
    expect(snapshot.capabilities?.prompt).toMatchObject({ image: true, audio: false });
  });

  it("preserves locked session state and maps server ids without provider routing", () => {
    const summary = mapRuntimeSessionSummary({
      sessionId: "locked-session",
      cwd: "/workspace",
      title: "Locked",
      updatedAt: 1_725_000_000_000,
      _meta: { isLocked: true },
    });
    expect(summary).toMatchObject({ id: "locked-session", path: "locked-session", provider: "devin", locked: true });

    const snapshot = buildAgentSnapshot({}, { sessionId: "locked-session", raw: { _meta: { isLocked: true } } });
    expect(snapshot.locked).toBe(true);
  });

  it("recognizes Devin's namespaced locked-session metadata", () => {
    const summary = mapRuntimeSessionSummary({
      sessionId: "locked-by-devin",
      cwd: "/workspace",
      title: "Locked",
      _meta: { "cognition.ai/isLocked": true },
    });
    expect(summary).toMatchObject({ id: "locked-by-devin", locked: true });

    const snapshot = buildAgentSnapshot({}, {
      sessionId: "locked-by-devin",
      raw: { _meta: { "cognition.ai/isLocked": true } },
    });
    expect(snapshot.locked).toBe(true);
  });

  it("fails permission responses closed unless an option is selected", () => {
    expect(permissionDecisionFromUi({ value: "allow-once" })).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    expect(permissionDecisionFromUi({ cancelled: true })).toEqual({ outcome: { outcome: "cancelled" } });
    expect(permissionDecisionFromUi("allow-once")).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("reports sandbox limits without inventing a Desktop fallback", () => {
    expect(platformSandboxDiagnostic("win32")).toMatchObject({ available: false });
    expect(platformSandboxDiagnostic("linux").message).toContain("bwrap");
    expect(platformSandboxDiagnostic("darwin").message).toContain("不会回退");
  });
});
