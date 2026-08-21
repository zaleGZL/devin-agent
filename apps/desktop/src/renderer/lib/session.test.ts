import { describe, expect, it } from "vitest";
import { buildSessionViewModel, togglePinned } from "./session";
import { createLocalSessionIndex, normalizeSessionSummaries, sessionCanDelete, sessionCanPrompt } from "../../shared/session";
import { normalizeDevinCapabilities } from "../../shared/capabilities";

describe("session presentation and local index", () => {
  const sessions = normalizeSessionSummaries([
    { sessionId: "s-1", cwd: "/work/a", title: "Fix parser", updatedAt: "2026-08-21T10:00:00Z" },
    { sessionId: "s-2", cwd: "/work/b", title: "Build UI", updatedAt: "2026-08-21T11:00:00Z", _meta: { "cognition.ai/isLocked": true } },
  ]);

  it("groups and searches by title, cwd and session id", () => {
    expect(buildSessionViewModel(sessions, "parser")).toMatchObject({ total: 1, groups: [{ cwd: "/work/a" }] });
    expect(buildSessionViewModel(sessions, "s-2").groups[0]?.sessions[0]?.sessionId).toBe("s-2");
  });

  it("does not persist transcript in local UI overlays", () => {
    let index = createLocalSessionIndex();
    index = togglePinned(index, "s-1", true);
    expect(index.overlays["s-1"]).toEqual({ sessionId: "s-1", pinned: true });
    expect(Object.keys(index.overlays["s-1"]!)).not.toContain("messages");
  });

  it("blocks prompt/delete for locked sessions or absent delete capability", () => {
    const capabilities = normalizeDevinCapabilities({ sessionCapabilities: { delete: {} } });
    const locked = sessions.find((session) => session.sessionId === "s-2")!;
    expect(sessionCanPrompt(locked)).toBe(false);
    expect(sessionCanDelete(locked, capabilities)).toBe(false);
    expect(sessionCanDelete(sessions.find((session) => session.sessionId === "s-1")!, capabilities)).toBe(true);
  });
});
