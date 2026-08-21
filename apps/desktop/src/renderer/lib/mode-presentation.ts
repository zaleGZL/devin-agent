import type { ModeCapability } from "../../shared/capabilities";
import type { AppLocale } from "./i18n";

export type ModeKind = "code" | "smart" | "ask" | "plan" | "bypass" | "autonomous" | "unknown";

export interface ModePresentation {
  kind: ModeKind;
  label: string;
  description?: string;
  localized: boolean;
}

type KnownModeKind = Exclude<ModeKind, "unknown">;

const MODE_ALIASES: Record<string, KnownModeKind> = {
  acceptedits: "code",
  code: "code",
  smart: "smart",
  ask: "ask",
  normal: "ask",
  plan: "plan",
  bypass: "bypass",
  bypasspermissions: "bypass",
  dangerous: "bypass",
  yolo: "bypass",
  autonomous: "autonomous",
};

const MODE_COPY: Record<AppLocale, Record<KnownModeKind, { label: string; description: string }>> = {
  en: {
    code: { label: "Code", description: "Write and edit code" },
    smart: { label: "Smart", description: "Auto-approve actions the model judges safe" },
    ask: { label: "Ask", description: "Answer questions without code changes" },
    plan: { label: "Plan", description: "Plan changes before implementing" },
    bypass: { label: "Bypass Permissions", description: "Auto-approve all tool calls" },
    autonomous: { label: "Autonomous", description: "Run commands inside the managed sandbox" },
  },
  "zh-CN": {
    code: { label: "代码", description: "编写和编辑代码" },
    smart: { label: "智能", description: "自动批准模型判断为安全的操作" },
    ask: { label: "问答", description: "回答问题，但不修改代码" },
    plan: { label: "规划", description: "实施前先规划改动" },
    bypass: { label: "绕过权限", description: "自动批准所有工具调用" },
    autonomous: { label: "自主模式", description: "在受管沙盒中运行命令" },
  },
};

export function getModePresentation(mode: ModeCapability, locale: AppLocale): ModePresentation {
  const kind = MODE_ALIASES[normalizeModeId(mode.id)];
  if (kind) return { kind, ...MODE_COPY[locale][kind], localized: true };

  const label = mode.name?.trim() || mode.id;
  const description = mode.description?.trim();
  return {
    kind: "unknown",
    label,
    ...(description ? { description } : {}),
    localized: false,
  };
}

function normalizeModeId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
