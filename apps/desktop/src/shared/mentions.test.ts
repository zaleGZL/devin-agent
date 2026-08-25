import { describe, expect, it } from "vitest";
import { parseMentionRefs, parseMentionSearchRequest, parseSkillListRequest } from "./mentions";

describe("mention shared boundaries", () => {
  it("accepts bounded workspace searches", () => {
    expect(parseMentionSearchRequest({ workspacePath: "/tmp/repo", kind: "file", query: "read", limit: 20 }))
      .toEqual({ workspacePath: "/tmp/repo", kind: "file", query: "read", limit: 20 });
  });

  it("accepts root-level mixed searches and bounded Skill cache requests", () => {
    expect(parseMentionSearchRequest({ workspacePath: "/tmp/repo", kind: "all", query: "pack", limit: 100 }))
      .toEqual({ workspacePath: "/tmp/repo", kind: "all", query: "pack", limit: 100 });
    expect(parseSkillListRequest({ workspacePath: "/tmp/repo", sessionId: "session-a", refresh: true }))
      .toEqual({ workspacePath: "/tmp/repo", sessionId: "session-a", refresh: true });
  });

  it("rejects invalid limits and multiple Skills", () => {
    expect(() => parseMentionSearchRequest({ workspacePath: "/tmp/repo", kind: "file", query: "", limit: 101 })).toThrow();
    expect(() => parseMentionRefs([
      { id: "a", kind: "skill", label: "A", command: "agents:a" },
      { id: "b", kind: "skill", label: "B", command: "agents:b" },
    ])).toThrow(/one Skill/i);
  });
});
