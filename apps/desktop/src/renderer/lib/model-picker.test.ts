import { describe, expect, it } from "vitest";
import { organizeModels, resolveNewSessionModelId, togglePinnedModelId } from "./model-picker";

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

  it("uses the global new-session preference without letting unavailable ids break creation", () => {
    expect(resolveNewSessionModelId("glm", models, "opus")).toBe("glm");
    expect(resolveNewSessionModelId("removed", models, "opus")).toBe("opus");
    expect(resolveNewSessionModelId("removed", models, "also-removed")).toBe("opus");
    expect(resolveNewSessionModelId("future-model", [], "")).toBe("future-model");
  });
});
