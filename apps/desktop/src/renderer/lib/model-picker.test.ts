import { describe, expect, it } from "vitest";
import { organizeModels, togglePinnedModelId } from "./model-picker";

const models = [
  { id: "opus", name: "Claude Opus" },
  { id: "glm", name: "GLM Max" },
  { id: "adaptive", name: "Adaptive", description: "Automatic routing" },
];

describe("model picker ordering", () => {
  it("places available pinned models first in the saved order", () => {
    expect(organizeModels(models, ["glm", "missing", "opus"], "")).toEqual({
      pinned: [models[1], models[0]],
      others: [models[2]],
    });
  });

  it("searches names, ids, and descriptions without losing pinned ordering", () => {
    expect(organizeModels(models, ["adaptive"], "automatic")).toEqual({
      pinned: [models[2]],
      others: [],
    });
  });

  it("pins newest first, unpins in place, and respects the limit", () => {
    expect(togglePinnedModelId(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    expect(togglePinnedModelId(["a", "b"], "a")).toEqual(["b"]);
  });
});
