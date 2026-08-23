import type { AgentSnapshot, PermissionMode } from "../../shared/types";

/** Selects the global preference only when the active Devin runtime advertises it. */
export function resolvePreferredModeId(
  preferredModeId: PermissionMode | null | undefined,
  modes: NonNullable<AgentSnapshot["modes"]>,
  currentModeId?: PermissionMode,
): PermissionMode {
  if (preferredModeId && modes.some((mode) => mode.id === preferredModeId)) return preferredModeId;
  if (currentModeId && (modes.length === 0 || modes.some((mode) => mode.id === currentModeId))) return currentModeId;
  return modes[0]?.id ?? "";
}
