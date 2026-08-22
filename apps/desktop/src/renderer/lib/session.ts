import type { DevinCapabilities } from "../../shared/capabilities";
import type { LocalSessionIndex, SessionGroup, SessionSearchResult, SessionSummary, SessionUiOverlay } from "../../shared/session";
import { applyLocalOverlays, groupSessions, normalizeSessionSummaries, recordRecentWorkspace, searchSessions, sessionCanDelete, sessionCanPrompt, sessionOperationGate, updateLocalOverlay } from "../../shared/session";

export { applyLocalOverlays, groupSessions, normalizeSessionSummaries, recordRecentWorkspace, searchSessions, sessionCanDelete, sessionCanPrompt, sessionOperationGate, updateLocalOverlay };
export type { LocalSessionIndex, SessionGroup, SessionSearchResult, SessionSummary, SessionUiOverlay };

export interface SessionViewModel {
  groups: SessionGroup[];
  total: number;
  query: string;
}
export function buildSessionViewModel(sessions: SessionSummary[], query = ""): SessionViewModel {
  const result = searchSessions(sessions, query);
  return { ...result, query };
}

export function sessionActionState(session: SessionSummary, capabilities: DevinCapabilities): { canPrompt: boolean; canDelete: boolean; locked: boolean } {
  return { canPrompt: sessionCanPrompt(session), canDelete: sessionCanDelete(session, capabilities), locked: session.locked === true };
}

export function togglePinned(index: LocalSessionIndex, sessionId: string, pinned: boolean): LocalSessionIndex {
  return updateLocalOverlay(index, { sessionId, pinned });
}
