import { describe, expect, it } from "vitest";
import { ElicitationUrlRegistry } from "./elicitation-url-registry";

describe("elicitation URL lifecycle", () => {
  it("matches completion by elicitation id and ignores unrelated completion", () => {
    const registry = new ElicitationUrlRegistry();
    registry.register("elicitation-a", "interaction-a");
    expect(registry.get("elicitation-b")).toBeUndefined();
    expect(registry.get("elicitation-a")).toBe("interaction-a");
  });

  it("does not let an old completion unregister a replacement interaction", () => {
    const registry = new ElicitationUrlRegistry();
    registry.register("elicitation", "old");
    registry.register("elicitation", "new");
    expect(registry.unregister("elicitation", "old")).toBe(false);
    expect(registry.get("elicitation")).toBe("new");
    expect(registry.unregister("elicitation", "new")).toBe(true);
  });
});
