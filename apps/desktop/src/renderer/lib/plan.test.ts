import { describe, expect, it } from "vitest";
import {
  formatMarkdownPlanRevisionPrompt,
  formatPlanRevisionPrompt,
  parseExitPlanPermission,
  parseStructuredPlan,
  planForNextTurn,
} from "./plan";

describe("planForNextTurn", () => {
  it("clears a completed plan when the next user turn starts", () => {
    expect(planForNextTurn({
      steps: [
        { step: "Implement", status: "completed" },
        { step: "Verify", status: "completed" },
      ],
    })).toBeUndefined();
  });

  it("keeps an unfinished plan across user turns", () => {
    const plan = {
      steps: [
        { step: "Implement", status: "completed" as const },
        { step: "Verify", status: "pending" as const },
      ],
    };
    expect(planForNextTurn(plan)).toBe(plan);
  });
});

describe("parseStructuredPlan", () => {
  const plan = {
    explanation: "Build and verify the game",
    plan: [
      { step: "Create the page", status: "in_progress" },
      { step: "Test gameplay", status: "pending" },
    ],
  };

  it("parses update_plan arguments", () => {
    expect(parseStructuredPlan(plan)).toEqual({
      explanation: "Build and verify the game",
      steps: plan.plan,
    });
  });

  it("parses the JSON used by approval requests", () => {
    expect(parseStructuredPlan(JSON.stringify(plan))?.steps).toEqual(plan.plan);
  });

  it("rejects unrelated or malformed input", () => {
    expect(parseStructuredPlan("not json")).toBeUndefined();
    expect(parseStructuredPlan({ plan: [{ step: "Missing status" }] })).toBeUndefined();
  });
});

describe("formatPlanRevisionPrompt", () => {
  const plan = {
    explanation: "Keep the change small",
    steps: [
      { step: "Inspect the existing flow", status: "completed" as const },
      { step: "Implement the editor", status: "in_progress" as const },
      { step: "Verify the UI", status: "pending" as const },
    ],
  };

  it("serializes the complete edited plan for Devin", () => {
    expect(formatPlanRevisionPrompt(plan, "en")).toContain("1. [completed] Inspect the existing flow");
    expect(formatPlanRevisionPrompt(plan, "en")).toContain("2. [in progress] Implement the editor");
    expect(formatPlanRevisionPrompt(plan, "en")).toContain("Explanation: Keep the change small");
  });

  it("uses localized control language without dropping statuses", () => {
    expect(formatPlanRevisionPrompt(plan, "zh-CN")).toContain("2. [进行中] Implement the editor");
    expect(formatPlanRevisionPrompt(plan, "zh-CN")).toContain("说明：Keep the change small");
  });
});

describe("parseExitPlanPermission", () => {
  it("extracts Devin's Markdown plan and the reject option", () => {
    expect(parseExitPlanPermission({
      sessionId: "session-1",
      toolCall: { rawInput: { plan: "# Plan\n\n1. Verify" } },
      options: [
        { optionId: "plan_normal", label: "Yes, implement plan" },
        { optionId: "reject_once", label: "No, plan needs changes" },
      ],
    })).toEqual({ plan: "# Plan\n\n1. Verify", rejectOptionId: "reject_once" });
  });

  it("correlates a partial permission request with the earlier tool update", () => {
    expect(parseExitPlanPermission({
      toolCall: { toolCallId: "exit-plan-1" },
      options: [{ optionId: "reject_once", label: "No, plan needs changes" }],
    }, [{ id: "exit-plan-1", args: { plan: "# Revised plan\n\n1. Inspect" } }])).toEqual({
      plan: "# Revised plan\n\n1. Inspect",
      rejectOptionId: "reject_once",
    });
  });

  it("rejects unrelated permission requests", () => {
    expect(parseExitPlanPermission({ toolCall: { rawInput: { command: "pnpm test" } }, options: [] })).toBeUndefined();
  });
});

describe("formatMarkdownPlanRevisionPrompt", () => {
  it("requires another approval instead of starting implementation", () => {
    const prompt = formatMarkdownPlanRevisionPrompt("# Revised plan", "en");
    expect(prompt).toContain("request plan approval again");
    expect(prompt).toContain("Do not start implementation");
    expect(prompt).toContain("# Revised plan");
  });
});
