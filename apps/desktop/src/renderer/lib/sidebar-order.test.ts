import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../shared/types";
import { moveByKey, orderedSessionIdsForGroup, reorderSessionsWithinGroup } from "./sidebar-order";

const project = "/workspace/project";

function session(id: string, cwd = project, patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    path: id,
    cwd,
    title: id,
    createdAt: `2026-08-22T09:00:0${id}.000Z`,
    updatedAt: `2026-08-22T09:00:0${id}.000Z`,
    ...patch,
  };
}

describe("sidebar order", () => {
  it("moves projects without mutating the source array", () => {
    const projects = [{ path: "a" }, { path: "b" }, { path: "c" }];
    expect(moveByKey(projects, "a", "c", (item) => item.path)).toEqual([
      { path: "b" },
      { path: "c" },
      { path: "a" },
    ]);
    expect(projects.map((item) => item.path)).toEqual(["a", "b", "c"]);
  });

  it("reorders only sessions from the dragged session group", () => {
    const sessions = [
      session("1"),
      session("2"),
      session("3", "/workspace/other"),
      session("4", project, { pinned: true }),
    ];
    const projectPaths = new Set([project, "/workspace/other"]);

    const reordered = reorderSessionsWithinGroup(sessions, `project:${project}`, "1", "2", projectPaths);

    expect(orderedSessionIdsForGroup(reordered, `project:${project}`, projectPaths)).toEqual(["1", "2"]);
    expect(reordered.find((item) => item.id === "3")?.sidebarOrder).toBeUndefined();
    expect(reordered.find((item) => item.id === "4")?.sidebarOrder).toBeUndefined();
  });
});
