import type { SessionSummary } from "../../shared/types";

export interface SidebarSessionPartition {
  pinned: SessionSummary[];
  project: SessionSummary[];
  recent: SessionSummary[];
}

export function partitionSidebarSessions(
  sessions: SessionSummary[],
  projectPaths: ReadonlySet<string>,
): SidebarSessionPartition {
  const result: SidebarSessionPartition = { pinned: [], project: [], recent: [] };
  for (const session of sessions) {
    if (session.archived) continue;
    if (session.pinned) {
      result.pinned.push(session);
    } else if (projectPaths.has(session.cwd)) {
      result.project.push(session);
    } else {
      result.recent.push(session);
    }
  }
  return result;
}
