import type { MentionRef, SkillMentionRef } from "../../shared/mentions";

export type PositionedMention = MentionRef & { start: number; end: number };

export type MentionTextSegment =
  | { type: "text"; text: string }
  | { type: "mention"; mention: MentionRef; text: string };

export interface AtTrigger {
  start: number;
  query: string;
}

export function findAtTrigger(
  value: string,
  caret = value.length,
  mentions: readonly PositionedMention[] = [],
): AtTrigger | undefined {
  const prefix = value.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
  if (!match) return undefined;
  const start = match.index + match[1]!.length;
  if (mentions.some((mention) => start >= mention.start && start < mention.end)) return undefined;
  return { start, query: match[2] ?? "" };
}

export function removeAtTrigger(value: string, trigger: AtTrigger, caret = value.length): string {
  return `${value.slice(0, trigger.start)}${value.slice(caret)}`.replace(/\s{2,}/g, " ");
}

export function mentionDisplayText(mention: MentionRef): string {
  return `@${mention.label}${mention.kind === "directory" ? "/" : ""}`;
}

export function isPositionedMention(mention: MentionRef): mention is PositionedMention {
  const candidate = mention as MentionRef & { start?: unknown; end?: unknown };
  return Number.isInteger(candidate.start)
    && Number.isInteger(candidate.end)
    && Number(candidate.start) >= 0
    && Number(candidate.end) > Number(candidate.start);
}

export function replaceDraftRange(
  value: string,
  mentions: readonly PositionedMention[],
  start: number,
  end: number,
  replacement: string,
): { value: string; mentions: PositionedMention[]; caret: number } {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const delta = replacement.length - (safeEnd - safeStart);
  return {
    value: `${value.slice(0, safeStart)}${replacement}${value.slice(safeEnd)}`,
    mentions: mentions.flatMap((mention) => {
      if (mention.end <= safeStart) return [mention];
      if (mention.start >= safeEnd) return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
      return [];
    }),
    caret: safeStart + replacement.length,
  };
}

export function removePositionedMention(
  value: string,
  mentions: readonly PositionedMention[],
  mentionId: string,
): { value: string; mentions: PositionedMention[]; caret: number } {
  const target = mentions.find((mention) => mention.id === mentionId);
  if (!target) return { value, mentions: [...mentions], caret: value.length };
  return replaceDraftRange(value, mentions, target.start, target.end, "");
}

export function insertMentionAtTrigger(
  value: string,
  mentions: readonly PositionedMention[],
  mention: MentionRef,
  trigger: AtTrigger,
  caret = value.length,
): { value: string; mentions: PositionedMention[]; caret: number } {
  let nextValue = value;
  let nextMentions = [...mentions];
  let triggerStart = trigger.start;
  let triggerEnd = caret;
  const replaced = nextMentions
    .filter((item) => item.id === mention.id || (mention.kind === "skill" && item.kind === "skill"))
    .sort((left, right) => right.start - left.start);

  for (const existing of replaced) {
    const result = removePositionedMention(nextValue, nextMentions, existing.id);
    nextValue = result.value;
    nextMentions = result.mentions;
    const removedLength = existing.end - existing.start;
    if (existing.end <= triggerStart) {
      triggerStart -= removedLength;
      triggerEnd -= removedLength;
    }
  }

  const display = mentionDisplayText(mention);
  const result = replaceDraftRange(nextValue, nextMentions, triggerStart, triggerEnd, display);
  const positioned: PositionedMention = {
    ...mention,
    start: triggerStart,
    end: triggerStart + display.length,
  };
  return {
    value: result.value,
    mentions: [...result.mentions, positioned].sort((left, right) => left.start - right.start),
    caret: positioned.end,
  };
}

export function splitMentionText(
  text: string,
  mentions: readonly MentionRef[],
  appendMissing = true,
): MentionTextSegment[] {
  const placed: PositionedMention[] = [];
  const missing: MentionRef[] = [];
  let searchFrom = 0;

  for (const mention of mentions) {
    const display = mentionDisplayText(mention);
    let start = isPositionedMention(mention)
      && mention.end <= text.length
      && text.slice(mention.start, mention.end) === display
      ? mention.start
      : text.indexOf(display, searchFrom);
    while (start >= 0 && placed.some((item) => start < item.end && start + display.length > item.start)) {
      start = text.indexOf(display, start + display.length);
    }
    if (start < 0) {
      missing.push(mention);
      continue;
    }
    const positioned = { ...mention, start, end: start + display.length } as PositionedMention;
    placed.push(positioned);
    searchFrom = positioned.end;
  }

  placed.sort((left, right) => left.start - right.start);
  const segments: MentionTextSegment[] = [];
  let cursor = 0;
  for (const mention of placed) {
    if (mention.start > cursor) segments.push({ type: "text", text: text.slice(cursor, mention.start) });
    segments.push({ type: "mention", mention, text: mentionDisplayText(mention) });
    cursor = mention.end;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });

  if (appendMissing) {
    for (const mention of missing) {
      const previous = segments.at(-1);
      const previousText = previous?.text ?? "";
      if (previous && previousText && !/\s$/.test(previousText)) segments.push({ type: "text", text: " " });
      segments.push({ type: "mention", mention, text: mentionDisplayText(mention) });
    }
  }
  return segments;
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
