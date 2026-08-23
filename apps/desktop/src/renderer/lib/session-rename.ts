import type { SessionSummary } from "../../shared/types";

export function optimisticSessionRename(session: SessionSummary, title: string): SessionSummary {
  return { ...session, title, customTitle: title };
}

export function confirmSessionRename(current: SessionSummary, confirmed: SessionSummary): SessionSummary {
  return { ...current, ...confirmed, customTitle: confirmed.customTitle };
}

export function rollbackSessionRename(_current: SessionSummary, previous: SessionSummary): SessionSummary {
  return previous;
}
