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

export function createFollowUpState<T = string>(policy: FollowUpPolicy = "queue"): FollowUpState<T> {
  return { running: false, policy, queued: [] };
}

export function setFollowUpRunning<T>(state: FollowUpState<T>, running: boolean): FollowUpState<T> {
  return { ...state, running };
}

export function submitFollowUp<T>(state: FollowUpState<T>, value: T, id = `follow-up-${Date.now()}-${Math.random().toString(36).slice(2)}`): { state: FollowUpState<T>; action: "send" | "queue" | "cancel-and-send" } {
  if (!state.running) return { state, action: "send" };
  if (state.policy === "cancel-first") return { state, action: "cancel-and-send" };
  const item = { id, value, createdAt: Date.now() };
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
