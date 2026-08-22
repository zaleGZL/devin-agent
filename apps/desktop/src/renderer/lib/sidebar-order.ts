import type { SessionSummary } from "../../shared/types";

export type SidebarSessionGroupKey = "pinned" | "recent" | `project:${string}`;

export function moveByKey<T>(items: T[], draggedKey: string, targetKey: string, getKey: (item: T) => string): T[] {
  const sourceIndex = items.findIndex((item) => getKey(item) === draggedKey);
  const targetIndex = items.findIndex((item) => getKey(item) === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = [...items];
  const [dragged] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

export function sessionSidebarGroupKey(
  session: SessionSummary,
  projectPaths: ReadonlySet<string>,
): SidebarSessionGroupKey | undefined {
  if (session.archived) return undefined;
  if (session.pinned) return "pinned";
  return projectPaths.has(session.cwd) ? `project:${session.cwd}` : "recent";
}

export function compareSidebarSessions(first: SessionSummary, second: SessionSummary): number {
  return Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))
    || compareOptionalOrder(first.sidebarOrder, second.sidebarOrder)
    || second.updatedAt.localeCompare(first.updatedAt)
    || first.title.localeCompare(second.title);
}

export function reorderSessionsWithinGroup(
  sessions: SessionSummary[],
  groupKey: SidebarSessionGroupKey,
  draggedId: string,
  targetId: string,
  projectPaths: ReadonlySet<string>,
): SessionSummary[] {
  const group = sessions
    .filter((session) => sessionSidebarGroupKey(session, projectPaths) === groupKey)
    .sort(compareSidebarSessions);
  const reordered = moveByKey(group, draggedId, targetId, (session) => session.id);
  if (reordered === group) return sessions;
  const orderById = new Map(reordered.map((session, index) => [session.id, index]));
  return sessions.map((session) => {
    const sidebarOrder = orderById.get(session.id);
    return sidebarOrder === undefined ? session : { ...session, sidebarOrder };
  });
}

export function orderedSessionIdsForGroup(
  sessions: SessionSummary[],
  groupKey: SidebarSessionGroupKey,
  projectPaths: ReadonlySet<string>,
): string[] {
  return sessions
    .filter((session) => sessionSidebarGroupKey(session, projectPaths) === groupKey)
    .sort(compareSidebarSessions)
    .map((session) => session.id);
}

function compareOptionalOrder(first: number | undefined, second: number | undefined): number {
  if (first === undefined && second === undefined) return 0;
  if (first === undefined) return -1;
  if (second === undefined) return 1;
  return first - second;
}
