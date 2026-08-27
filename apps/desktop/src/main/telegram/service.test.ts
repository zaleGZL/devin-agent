import { describe, expect, it } from "vitest";
import { permissionDecisionForBot } from "./service";

describe("TelegramBotService permission policy", () => {
  it("prefers a runtime-advertised one-time approval", () => {
    expect(permissionDecisionForBot({
      options: [
        { optionId: "reject", label: "Reject" },
        { optionId: "allow-once", label: "Allow once" },
        { optionId: "allow-session", label: "Allow for session" },
      ],
    })).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
  });

  it("fails closed when no affirmative option is advertised", () => {
    expect(permissionDecisionForBot({ options: [{ optionId: "reject", label: "Reject" }] }))
      .toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("supports Chinese option labels", () => {
    expect(permissionDecisionForBot({
      options: [
        { optionId: "deny", label: "拒绝" },
        { optionId: "allow", label: "允许本次" },
      ],
    })).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  });
});
