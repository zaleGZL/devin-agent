import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../shared/types";
import { partitionSidebarSessions } from "./sidebar-sessions";

const session = (overrides: Partial<SessionSummary>): SessionSummary => ({
  id: "session-1",
  path: "session-1",
  title: "Session",
  cwd: "/workspace/project",
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
  ...overrides,
});

describe("sidebar session partition", () => {
  it("moves a pinned project session into the global pinned group only", () => {
    const pinned = session({ pinned: true });
    const groups = partitionSidebarSessions([pinned], new Set([pinned.cwd]));

    expect(groups.pinned).toEqual([pinned]);
    expect(groups.project).toEqual([]);
    expect(groups.recent).toEqual([]);
  });

  it("returns an unpinned session to its original project or recent group", () => {
    const projectSession = session({ pinned: false });
    const recentSession = session({ id: "session-2", path: "session-2", cwd: "/tmp" });
    const groups = partitionSidebarSessions([projectSession, recentSession], new Set([projectSession.cwd]));

    expect(groups.pinned).toEqual([]);
    expect(groups.project).toEqual([projectSession]);
    expect(groups.recent).toEqual([recentSession]);
  });
});
