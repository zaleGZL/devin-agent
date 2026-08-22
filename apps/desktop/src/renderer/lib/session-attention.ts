export function markBackgroundSessionUnread(
  current: ReadonlySet<string>,
  sessionId: string | undefined,
  activeSessionId: string | undefined,
): Set<string> {
  if (!sessionId || sessionId === activeSessionId || current.has(sessionId)) return current as Set<string>;
  const next = new Set(current);
  next.add(sessionId);
  return next;
}

export function clearSessionUnread(
  current: ReadonlySet<string>,
  sessionId: string | undefined,
): Set<string> {
  if (!sessionId || !current.has(sessionId)) return current as Set<string>;
  const next = new Set(current);
  next.delete(sessionId);
  return next;
}
