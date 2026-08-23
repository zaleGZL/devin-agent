import { describe, expect, it } from "vitest";
import {
  addMention,
  findAtTrigger,
  insertMentionAtTrigger,
  mergeRootMentionOptions,
  rankSkillMentions,
  removeAtTrigger,
  removePositionedMention,
  splitMentionText,
} from "./mentions";

describe("composer mentions", () => {
  it("finds and removes only the active @ token", () => {
    expect(findAtTrigger("please check @src/app")).toEqual({ start: 13, query: "src/app" });
    expect(removeAtTrigger("please check @src/app", { start: 13, query: "src/app" })).toBe("please check ");
    expect(findAtTrigger("email@example.com")).toBeUndefined();
    expect(findAtTrigger("Use @README.md，", 15, [
      { id: "file", kind: "file", label: "README.md", path: "README.md", start: 4, end: 14 },
    ])).toBeUndefined();
  });

  it("matches only continuous substrings of the Skill Name and replaces the previous Skill", () => {
    const skills = rankSkillMentions([
      {
        id: "skill:package",
        kind: "skill",
        command: "unrelated-command",
        label: "Package Review",
        description: "TradingView keyword research",
        source: ".agents/skills/tradingview/SKILL.md",
      },
      { id: "skill:research", kind: "skill", command: "package-command", label: "Research" },
    ], "pack");
    expect(skills.map((skill) => skill.label)).toEqual(["Package Review"]);
    expect(rankSkillMentions(skills, "PKGREV")).toEqual([]);
    expect(rankSkillMentions(skills, "tradingview")).toEqual([]);
    expect(rankSkillMentions(skills, "unrelated-command")).toEqual([]);
    expect(addMention([skills[0]!], { id: "skill:other", kind: "skill", command: "other", label: "other" }))
      .toEqual([{ id: "skill:other", kind: "skill", command: "other", label: "other" }]);
  });

  it("places Skills before workspace results without changing group order", () => {
    expect(mergeRootMentionOptions(["skill-b", "skill-a"], ["file-a", "directory-a"], 3))
      .toEqual(["skill-b", "skill-a", "file-a"]);
  });

  it("inserts mentions at the active @ position and preserves their inline order", () => {
    const first = insertMentionAtTrigger(
      "这个文件 @，基于这个 skill @",
      [],
      { id: "file", kind: "file", label: "README.md", path: "README.md" },
      { start: 5, query: "" },
      6,
    );
    const secondTrigger = findAtTrigger(first.value, first.value.length)!;
    const second = insertMentionAtTrigger(
      first.value,
      first.mentions,
      { id: "skill", kind: "skill", label: "openspec-archive-change", command: "openspec-archive-change" },
      secondTrigger,
      first.value.length,
    );

    expect(second.value).toBe("这个文件 @README.md，基于这个 skill @openspec-archive-change");
    expect(splitMentionText(second.value, second.mentions).map((segment) => segment.type)).toEqual([
      "text", "mention", "text", "mention",
    ]);
  });

  it("removes an inline mention together with its text and shifts later positions", () => {
    const value = "Use @README.md then @docs/";
    const mentions = [
      { id: "file", kind: "file" as const, label: "README.md", path: "README.md", start: 4, end: 14 },
      { id: "directory", kind: "directory" as const, label: "docs", path: "docs", start: 20, end: 26 },
    ];
    const result = removePositionedMention(value, mentions, "file");
    expect(result.value).toBe("Use  then @docs/");
    expect(result.mentions[0]).toMatchObject({ id: "directory", start: 10, end: 16 });
  });

  it("replaces the previous Skill token because prompts support only one Skill", () => {
    const previous = insertMentionAtTrigger(
      "Use @",
      [],
      { id: "skill:first", kind: "skill", label: "first", command: "first" },
      { start: 4, query: "" },
      5,
    );
    const value = `${previous.value} then @`;
    const next = insertMentionAtTrigger(
      value,
      previous.mentions,
      { id: "skill:second", kind: "skill", label: "second", command: "second" },
      findAtTrigger(value, value.length)!,
      value.length,
    );
    expect(next.value).toBe("Use  then @second");
    expect(next.mentions.map((mention) => mention.id)).toEqual(["skill:second"]);
  });
});
