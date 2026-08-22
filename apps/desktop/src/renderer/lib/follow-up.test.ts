import { describe, expect, it } from "vitest";
import {
  createFollowUpState,
  enqueueFollowUp,
  moveFollowUp,
  removeFollowUp,
  restoreFollowUp,
  setFollowUpRunning,
  submitFollowUp,
  takeFollowUp,
  takeNextFollowUp,
  updateFollowUp,
  type FollowUpItem,
} from "./follow-up";

describe("follow-up policy", () => {
  it("queues follow-ups and releases them only after the prompt settles", () => {
    let state = setFollowUpRunning(createFollowUpState<string>("queue"), true);
    const queued = submitFollowUp(state, "second", "q1");
    expect(queued.action).toBe("queue");
    state = queued.state;
    expect(takeNextFollowUp(state).item).toBeUndefined();
    const next = takeNextFollowUp(setFollowUpRunning(state, false));
    expect(next.item).toMatchObject({ id: "q1", value: "second" });
  });

  it("requires cancellation before sending when configured cancel-first", () => {
    const state = setFollowUpRunning(createFollowUpState<string>("cancel-first"), true);
    expect(submitFollowUp(state, "interrupt").action).toBe("cancel-and-send");
  });

  it("keeps an unbounded ordered queue that can be edited, moved, and deleted", () => {
    let queue = Array.from({ length: 1_000 }).reduce<FollowUpItem<string>[]>(
      (current, _, index) => enqueueFollowUp(current, `message-${index}`, `q${index}`, index),
      [],
    );
    expect(queue).toHaveLength(1_000);

    queue = updateFollowUp(queue, "q10", () => "edited");
    queue = moveFollowUp(queue, "q10", "q2");
    expect(queue[2]).toMatchObject({ id: "q10", value: "edited" });
    queue = removeFollowUp(queue, "q3");
    expect(queue.some((item) => item.id === "q3")).toBe(false);
  });

  it("takes any selected item without changing sibling order and can restore failures", () => {
    const queue = [
      { id: "a", value: "first", createdAt: 1 },
      { id: "b", value: "steer", createdAt: 2 },
      { id: "c", value: "last", createdAt: 3 },
    ];
    const taken = takeFollowUp(queue, "b");
    expect(taken.queue.map((item) => item.id)).toEqual(["a", "c"]);
    expect(taken.item?.value).toBe("steer");
    expect(restoreFollowUp(taken.queue, taken.item!, taken.index)).toEqual(queue);
  });
});
