import { describe, expect, it } from "vitest";
import fixture from "./fixtures/acp-v1-editable-command.json";
import {
  editableCommandFromPermission,
  permissionDecisionFromInteraction,
  permissionToolCallId,
  revisedCommandFromResult,
} from "./permission-interactions";

describe("permission vendor contract", () => {
  it("parses the real Devin editable-command fixture", () => {
    expect(permissionToolCallId(fixture.permissionRequest)).toBe("tool-fixture");
    expect(editableCommandFromPermission(fixture.permissionRequest)).toEqual({ command: "touch [SAFE_FILE]" });
  });

  it("fails closed for malformed or unadvertised metadata shapes", () => {
    expect(editableCommandFromPermission({ toolCall: { _meta: { "cognition.ai/editableCommand": true } } })).toBeUndefined();
    expect(editableCommandFromPermission({ toolCall: { _meta: { "cognition.ai/editableCommand": "" } } })).toBeUndefined();
  });

  it("preserves standard permission options and emits the verified update key", () => {
    const options = [{ id: "allow_once" }, { id: "reject_once" }];
    expect(permissionDecisionFromInteraction(
      { action: "select", optionId: "allow_once", updatedCommand: "touch [EDITED_SAFE_FILE]" },
      options,
      "touch [SAFE_FILE]",
    )).toEqual(fixture.editedPermissionResponse);
    expect(permissionDecisionFromInteraction({ action: "select", optionId: "unknown" }, options)).toEqual({ outcome: { outcome: "cancelled" } });
    expect(permissionDecisionFromInteraction(
      { action: "select", optionId: "allow_once", updatedCommand: "touch edited.txt" },
      options,
      "touch edited.txt",
    )).toEqual(fixture.finalPermissionResponse);
  });

  it("accepts only the verified command-revision response", () => {
    expect(revisedCommandFromResult(fixture.commandRevision.response)).toBe("touch [REVISED_SAFE_FILE]");
    expect(revisedCommandFromResult({ title: "not a command" })).toBeUndefined();
  });
});
