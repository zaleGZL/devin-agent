import { describe, expect, it } from "vitest";
import { beginCommandRevision, completeCommandRevision, rollbackCommandRevision, type PermissionInteractionRequest } from "./command-revision-state";

const request: PermissionInteractionRequest = {
  kind: "permission",
  id: "interaction",
  generation: 1,
  sessionId: "session",
  title: "Approval",
  message: "Review",
  options: [{ id: "allow", label: "Allow" }, { id: "reject", label: "Reject" }],
  editableCommand: { command: "touch original.txt" },
  commandRevision: { command: "touch original.txt", revision: 0 },
  raw: {},
};

describe("command revision state", () => {
  it("requires monotonic revisions and a second explicit permission decision", () => {
    const inFlight = beginCommandRevision(request, 1)!;
    const completed = completeCommandRevision(inFlight, 1, "touch revised.txt")!;
    expect(completed).toMatchObject({ editableCommand: { command: "touch revised.txt" }, commandRevision: { revision: 1 } });
    expect(completed.options).toEqual(request.options);
  });

  it("ignores stale completion and rolls back only the current revision", () => {
    const second = beginCommandRevision({ ...request, commandRevision: { command: "touch one.txt", revision: 1 } }, 2)!;
    expect(completeCommandRevision(second, 1, "stale")).toBeUndefined();
    expect(rollbackCommandRevision(second, 1)).toBe(second);
    expect(rollbackCommandRevision(second, 2).commandRevision?.revision).toBe(1);
  });
});
