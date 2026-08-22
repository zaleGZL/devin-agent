import { describe, expect, it } from "vitest";
import type { WorkspaceChanges } from "../../shared/types";
import { sameWorkspaceChanges } from "./git-changes";

const snapshot = (checkedAt: string, workingTreeStatus = "M"): WorkspaceChanges => ({
  workspacePath: "/workspace",
  repositoryRoot: "/workspace",
  branch: "main",
  isRepository: true,
  checkedAt,
  changes: [{
    path: "src/app.ts",
    kind: "modified",
    indexStatus: " ",
    workingTreeStatus,
    staged: false,
    unstaged: true,
  }],
});

describe("sameWorkspaceChanges", () => {
  it("ignores polling timestamps when Git state has not changed", () => {
    expect(sameWorkspaceChanges(snapshot("2026-08-22T01:00:00Z"), snapshot("2026-08-22T01:00:03Z"))).toBe(true);
  });

  it("detects render-relevant Git state changes", () => {
    expect(sameWorkspaceChanges(snapshot("2026-08-22T01:00:00Z"), snapshot("2026-08-22T01:00:03Z", "D"))).toBe(false);
  });
});
