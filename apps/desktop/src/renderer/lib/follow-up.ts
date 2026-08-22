/** ACP v1 has cancel but no standard in-flight steer request. */
export type FollowUpPolicy = "queue" | "cancel-first";

export interface FollowUpItem<T = string> {
  id: string;
  value: T;
  createdAt: number;
}
export interface FollowUpState<T = string> {
  running: boolean;
  policy: FollowUpPolicy;
  queued: FollowUpItem<T>[];
}

export interface FollowUpTakeResult<T> {
  queue: FollowUpItem<T>[];
  item?: FollowUpItem<T>;
  index: number;
}

export function createFollowUpItem<T>(
  value: T,
  id = `follow-up-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  createdAt = Date.now(),
): FollowUpItem<T> {
  return { id, value, createdAt };
}

/** The queue is intentionally unbounded; the UI may virtualize or scroll it. */
export function enqueueFollowUp<T>(
  queue: readonly FollowUpItem<T>[],
  value: T,
  id?: string,
  createdAt?: number,
): FollowUpItem<T>[] {
  return [...queue, createFollowUpItem(value, id, createdAt)];
}

export function removeFollowUp<T>(queue: readonly FollowUpItem<T>[], id: string): FollowUpItem<T>[] {
  return queue.filter((item) => item.id !== id);
}

export function updateFollowUp<T>(
  queue: readonly FollowUpItem<T>[],
  id: string,
  update: (value: T) => T,
): FollowUpItem<T>[] {
  return queue.map((item) => item.id === id ? { ...item, value: update(item.value) } : item);
}

/** Move into the target item's current slot, matching the queue's live reorder feedback. */
export function moveFollowUp<T>(
  queue: readonly FollowUpItem<T>[],
  draggedId: string,
  targetId: string,
): FollowUpItem<T>[] {
  if (draggedId === targetId) return [...queue];
  const fromIndex = queue.findIndex((item) => item.id === draggedId);
  const targetIndex = queue.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || targetIndex < 0) return [...queue];
  const next = [...queue];
  const [dragged] = next.splice(fromIndex, 1);
  if (!dragged) return [...queue];
  next.splice(targetIndex, 0, dragged);
  return next;
}

export function takeFollowUp<T>(queue: readonly FollowUpItem<T>[], id?: string): FollowUpTakeResult<T> {
  const index = id ? queue.findIndex((item) => item.id === id) : queue.length > 0 ? 0 : -1;
  if (index < 0) return { queue: [...queue], index: -1 };
  const next = [...queue];
  const [item] = next.splice(index, 1);
  return { queue: next, item, index };
}

export function restoreFollowUp<T>(
  queue: readonly FollowUpItem<T>[],
  item: FollowUpItem<T>,
  index: number,
): FollowUpItem<T>[] {
  const next = [...queue];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export function createFollowUpState<T = string>(policy: FollowUpPolicy = "queue"): FollowUpState<T> {
  return { running: false, policy, queued: [] };
}

export function setFollowUpRunning<T>(state: FollowUpState<T>, running: boolean): FollowUpState<T> {
  return { ...state, running };
}

export function submitFollowUp<T>(state: FollowUpState<T>, value: T, id = `follow-up-${Date.now()}-${Math.random().toString(36).slice(2)}`): { state: FollowUpState<T>; action: "send" | "queue" | "cancel-and-send" } {
  if (!state.running) return { state, action: "send" };
  if (state.policy === "cancel-first") return { state, action: "cancel-and-send" };
  const item = createFollowUpItem(value, id);
  return { state: { ...state, queued: [...state.queued, item] }, action: "queue" };
}

export function dequeueFollowUp<T>(state: FollowUpState<T>): { state: FollowUpState<T>; item?: FollowUpItem<T> } {
  const [item, ...rest] = state.queued;
  return { state: { ...state, queued: rest }, item };
}

/** Call after cancel/turn completion; only then is the next prompt allowed. */
export function takeNextFollowUp<T>(state: FollowUpState<T>): { state: FollowUpState<T>; item?: FollowUpItem<T> } {
  if (state.running) return { state };
  return dequeueFollowUp(state);
}
