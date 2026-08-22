import { describe, expect, it } from "vitest";
import { getModePresentation } from "./mode-presentation";

describe("getModePresentation", () => {
  it("localizes known Devin modes by stable id", () => {
    expect(getModePresentation({ id: "accept-edits", name: "Code" }, "zh-CN")).toEqual({
      kind: "code",
      label: "代码",
      description: "编写和编辑代码",
      localized: true,
    });
    expect(getModePresentation({ id: "normal", name: "Ask" }, "zh-CN").label).toBe("问答");
    expect(getModePresentation({ id: "bypass-permissions", name: "Bypass Permissions" }, "zh-CN").kind).toBe("bypass");
  });

  it("keeps the ACP copy for future unknown modes", () => {
    expect(getModePresentation({ id: "future-mode", name: "Future Mode", description: "Provided by a newer Devin CLI" }, "zh-CN")).toEqual({
      kind: "unknown",
      label: "Future Mode",
      description: "Provided by a newer Devin CLI",
      localized: false,
    });
  });

  it("falls back to the raw id when ACP omits a name", () => {
    expect(getModePresentation({ id: "future-mode" }, "zh-CN")).toMatchObject({
      kind: "unknown",
      label: "future-mode",
      localized: false,
    });
  });
});
