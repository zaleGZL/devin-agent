import { describe, expect, it } from "vitest";
import { createDevinWorkspaceUrl } from "./devin-desktop";

describe("createDevinWorkspaceUrl", () => {
  it("encodes an absolute workspace path for Devin Desktop", () => {
    expect(createDevinWorkspaceUrl("/workspace/Project with spaces"))
      .toBe("devin://file/workspace/Project%20with%20spaces");
  });
});
