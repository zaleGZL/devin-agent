import type { DesktopInteractionRequest } from "../shared/interactions";

export type PermissionInteractionRequest = Extract<DesktopInteractionRequest, { kind: "permission" }>;

export function beginCommandRevision(request: PermissionInteractionRequest, revision: number): PermissionInteractionRequest | undefined {
  if (!request.commandRevision || !Number.isSafeInteger(revision) || revision !== request.commandRevision.revision + 1) return undefined;
  return { ...request, commandRevision: { ...request.commandRevision, revision } };
}

export function completeCommandRevision(request: PermissionInteractionRequest, revision: number, command: string): PermissionInteractionRequest | undefined {
  const normalized = command.trim();
  if (!request.commandRevision || request.commandRevision.revision !== revision || !normalized) return undefined;
  return { ...request, editableCommand: { command: normalized }, commandRevision: { command: normalized, revision } };
}

export function rollbackCommandRevision(request: PermissionInteractionRequest, revision: number): PermissionInteractionRequest {
  return request.commandRevision?.revision === revision
    ? { ...request, commandRevision: { ...request.commandRevision, revision: revision - 1 } }
    : request;
}
