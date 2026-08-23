export type PlanStepStatus = "pending" | "in_progress" | "completed";

export interface StructuredPlan {
  explanation?: string;
  steps: Array<{ step: string; status: PlanStepStatus }>;
}

export type PlanPromptLocale = "en" | "zh-CN";

export interface ExitPlanPermission {
  plan: string;
  rejectOptionId: string;
}

export interface PermissionToolSnapshot {
  id: string;
  args?: unknown;
}

export function planForNextTurn<T extends StructuredPlan>(plan: T | undefined): T | undefined {
  if (!plan || plan.steps.some((item) => item.status !== "completed")) return plan;
  return undefined;
}

export function parseStructuredPlan(value: unknown): StructuredPlan | undefined {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(input)) return undefined;

  const source = Array.isArray(input.plan) ? input.plan : Array.isArray(input.steps) ? input.steps : undefined;
  if (!source || source.length === 0) return undefined;

  const steps = source.flatMap((item) => {
    if (!isRecord(item) || typeof item.step !== "string" || !isPlanStatus(item.status)) return [];
    const step = item.step.trim();
    return step ? [{ step, status: item.status }] : [];
  });
  if (steps.length !== source.length) return undefined;

  const explanation = typeof input.explanation === "string" ? input.explanation.trim() : undefined;
  return { ...(explanation ? { explanation } : {}), steps };
}

export function formatPlanRevisionPrompt(plan: StructuredPlan, locale: PlanPromptLocale): string {
  const status = locale === "zh-CN"
    ? { completed: "已完成", in_progress: "进行中", pending: "待处理" }
    : { completed: "completed", in_progress: "in progress", pending: "pending" };
  const explanation = plan.explanation?.trim();
  const steps = plan.steps.map((item, index) => `${index + 1}. [${status[item.status]}] ${item.step.trim()}`).join("\n");
  if (locale === "zh-CN") {
    return [
      "请将当前执行计划替换为以下由用户手动编辑的计划，并通过计划更新事件同步。除非现实约束要求，否则不要擅自改写步骤；请保留用户指定的状态。随后严格按此计划继续。",
      explanation ? `\n说明：${explanation}` : "",
      `\n步骤：\n${steps}`,
    ].join("");
  }
  return [
    "Replace the current execution plan with the user-edited plan below and publish a plan update. Do not rewrite the steps unless a real constraint requires it; preserve the statuses selected by the user. Then continue strictly from this plan.",
    explanation ? `\n\nExplanation: ${explanation}` : "",
    `\n\nSteps:\n${steps}`,
  ].join("");
}

export function parseExitPlanPermission(value: unknown, tools: PermissionToolSnapshot[] = []): ExitPlanPermission | undefined {
  if (!isRecord(value)) return undefined;
  const toolCall = isRecord(value.toolCall) ? value.toolCall : isRecord(value.tool_call) ? value.tool_call : undefined;
  if (!toolCall) return undefined;
  const options = Array.isArray(value.options) ? value.options : [];
  const rejectOption = options.find((option) => {
    if (!isRecord(option)) return false;
    const optionId = String(option.optionId ?? option.id ?? "").toLowerCase();
    const label = String(option.label ?? option.name ?? "").toLowerCase();
    return optionId === "reject_once" || label.includes("plan needs changes");
  });
  if (!isRecord(rejectOption)) return undefined;
  const rejectOptionId = String(rejectOption.optionId ?? rejectOption.id ?? "").trim();
  if (!rejectOptionId) return undefined;

  // Permission requests contain a ToolCallUpdate, so Devin may only repeat the
  // toolCallId and leave rawInput on the earlier session/tool_call update.
  const toolCallId = String(toolCall.toolCallId ?? toolCall.tool_call_id ?? toolCall.id ?? "").trim();
  const correlatedInput = toolCallId ? tools.find((tool) => tool.id === toolCallId)?.args : undefined;
  const plan = extractPlan(toolCall.rawInput ?? toolCall.raw_input) ?? extractPlan(correlatedInput);
  return plan ? { plan, rejectOptionId } : undefined;
}

export function formatMarkdownPlanRevisionPrompt(plan: string, locale: PlanPromptLocale): string {
  const content = plan.trim();
  return locale === "zh-CN"
    ? `这是我手动修改后的完整计划。请用它替换当前计划，重新发布计划审批，不要开始实施。\n\n${content}`
    : `This is my complete manually revised plan. Replace the current plan with it and request plan approval again. Do not start implementation.\n\n${content}`;
}

function isPlanStatus(value: unknown): value is PlanStepStatus {
  return value === "pending" || value === "in_progress" || value === "completed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPlan(value: unknown): string | undefined {
  if (isRecord(value) && typeof value.plan === "string") {
    const plan = value.plan.trim();
    return plan || undefined;
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  try {
    return extractPlan(JSON.parse(text));
  } catch {
    return undefined;
  }
}
