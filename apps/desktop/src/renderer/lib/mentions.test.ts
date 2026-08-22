import { describe, expect, it } from "vitest";
import { addMention, findAtTrigger, mergeRootMentionOptions, rankSkillMentions, removeAtTrigger } from "./mentions";

describe("composer mentions", () => {
  it("finds and removes only the active @ token", () => {
    expect(findAtTrigger("please check @src/app")).toEqual({ start: 13, query: "src/app" });
    expect(removeAtTrigger("please check @src/app", { start: 13, query: "src/app" })).toBe("please check ");
    expect(findAtTrigger("email@example.com")).toBeUndefined();
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
});
