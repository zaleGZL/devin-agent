import type { MentionRef, SkillMentionRef } from "../../shared/mentions";

export interface AtTrigger {
  start: number;
  query: string;
}

export function findAtTrigger(value: string, caret = value.length): AtTrigger | undefined {
  const prefix = value.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
  if (!match) return undefined;
  return { start: match.index + match[1]!.length, query: match[2] ?? "" };
}

export function removeAtTrigger(value: string, trigger: AtTrigger, caret = value.length): string {
  return `${value.slice(0, trigger.start)}${value.slice(caret)}`.replace(/\s{2,}/g, " ");
}

export function rankSkillMentions(skills: readonly SkillMentionRef[], query: string): SkillMentionRef[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...skills];
  return skills.filter((skill) => skill.label.toLocaleLowerCase().includes(needle));
}

export function mergeRootMentionOptions<SkillOption, WorkspaceOption>(
  skillOptions: readonly SkillOption[],
  workspaceOptions: readonly WorkspaceOption[],
  limit: number,
): Array<SkillOption | WorkspaceOption> {
  return [...skillOptions, ...workspaceOptions].slice(0, Math.max(0, limit));
}

export function addMention(current: readonly MentionRef[], mention: MentionRef): MentionRef[] {
  const withoutDuplicate = current.filter((item) => item.id !== mention.id);
  return mention.kind === "skill"
    ? [...withoutDuplicate.filter((item) => item.kind !== "skill"), mention]
    : [...withoutDuplicate, mention];
}
