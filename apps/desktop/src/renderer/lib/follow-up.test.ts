import { describe, expect, it } from "vitest";
import { createFollowUpState, setFollowUpRunning, submitFollowUp, takeNextFollowUp } from "./follow-up";

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
});
