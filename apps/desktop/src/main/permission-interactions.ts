import type { JsonObject, PermissionDecision } from "../shared/acp-types";
import type { DesktopInteractionResponse } from "../shared/interactions";

const EDITABLE_COMMAND_KEY = "cognition.ai/editableCommand";
const UPDATED_INPUT_KEY = "cognition.ai/updatedInput";
const MAX_COMMAND_LENGTH = 100_000;

export function permissionToolCallId(request: JsonObject): string | undefined {
  const toolCall = recordValue(request.toolCall);
  return stringValue(toolCall?.toolCallId) || undefined;
}

/**
 * Devin 3000.5.20 exposes the editable shell command as a string in the
 * permission tool call's vendor metadata. Unknown shapes deliberately fall
 * back to the standard permission flow.
 */
export function editableCommandFromPermission(request: JsonObject): { command: string } | undefined {
  const toolCall = recordValue(request.toolCall);
  const meta = recordValue(toolCall?._meta);
  const command = stringValue(meta?.[EDITABLE_COMMAND_KEY]);
  return command && command.length <= MAX_COMMAND_LENGTH ? { command } : undefined;
}

export function permissionDecisionFromInteraction(
  response: DesktopInteractionResponse,
  options: ReadonlyArray<{ id: string }>,
  originalCommand?: string,
): PermissionDecision {
  if (response.action !== "select" || !options.some((option) => option.id === response.optionId)) {
    return { outcome: { outcome: "cancelled" } };
  }
  const updatedCommand = typeof response.updatedCommand === "string" ? response.updatedCommand.trim() : "";
  const commandChanged = Boolean(updatedCommand) && updatedCommand !== originalCommand?.trim();
  return {
    outcome: {
      outcome: "selected",
      optionId: response.optionId,
      ...(commandChanged && updatedCommand.length <= MAX_COMMAND_LENGTH
        ? { _meta: { [UPDATED_INPUT_KEY]: { command: updatedCommand } } }
        : {}),
    },
  };
}

export function revisedCommandFromResult(value: unknown): string | undefined {
  const command = stringValue(recordValue(value)?.command).trim();
  return command && command.length <= MAX_COMMAND_LENGTH ? command : undefined;
}

function recordValue(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
