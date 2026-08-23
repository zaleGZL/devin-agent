import { describe, expect, it, vi } from "vitest";
import { InteractionBroker } from "./interaction-broker";

describe("InteractionBroker", () => {
  it("keeps concurrent requests separate and settles exactly once", async () => {
    let sequence = 0;
    const broker = new InteractionBroker(() => `i-${++sequence}`);
    const first = broker.open({ value: 1 }, { kind: "permission", generation: 1, sessionId: "s-1", cancelResult: "cancel" });
    const second = broker.open({ value: 2 }, { kind: "elicitation-form", generation: 1, sessionId: "s-2", cancelResult: "cancel" });
    expect(broker.settle(second.id, "accepted", 1)).toBe(true);
    expect(broker.settle(second.id, "late", 1)).toBe(false);
    expect(await second.result).toBe("accepted");
    expect(broker.cancelSession("s-1")).toBe(1);
    expect(await first.result).toBe("cancel");
  });

  it("rejects stale generations and cancels an old connection", async () => {
    const broker = new InteractionBroker(() => "i-1");
    const pending = broker.open({}, { kind: "permission", generation: 3, cancelResult: "cancel" });
    expect(broker.settle(pending.id, "accepted", 2)).toBe(false);
    expect(broker.cancelGeneration(3)).toBe(1);
    expect(await pending.result).toBe("cancel");
  });

  it("cancels on timeout and window destruction", async () => {
    vi.useFakeTimers();
    const broker = new InteractionBroker(() => "i-1");
    const timed = broker.open({}, { kind: "elicitation-url", generation: 1, ownerId: 9, timeoutMs: 50, cancelResult: "cancel" });
    await vi.advanceTimersByTimeAsync(50);
    expect(await timed.result).toBe("cancel");
    expect(broker.size).toBe(0);

    const owned = broker.open({}, { kind: "permission", generation: 1, ownerId: 9, cancelResult: "cancel" });
    expect(broker.cancelOwner(9)).toBe(1);
    expect(await owned.result).toBe("cancel");
    vi.useRealTimers();
  });
});
