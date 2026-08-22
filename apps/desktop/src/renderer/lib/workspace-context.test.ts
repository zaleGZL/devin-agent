import { describe, expect, it } from "vitest";
import { resolveNewTaskCwd } from "./workspace-context";

describe("resolveNewTaskCwd", () => {
  it("uses the selected project when one is present", () => {
    expect(resolveNewTaskCwd("/work/project", "/Users/zale")).toBe("/work/project");
  });

  it("uses the absolute Home directory when no project is selected", () => {
    expect(resolveNewTaskCwd(undefined, "/Users/zale")).toBe("/Users/zale");
  });
});
