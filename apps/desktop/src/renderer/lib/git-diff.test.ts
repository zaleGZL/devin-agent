import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./git-diff";

describe("parseUnifiedDiff", () => {
  it("tracks old and new line numbers across a hunk", () => {
    const lines = parseUnifiedDiff("@@ -4,2 +4,3 @@\n same\n-old\n+new\n+more");
    expect(lines).toEqual([
      { kind: "hunk", text: "@@ -4,2 +4,3 @@" },
      { kind: "context", text: " same", oldLine: 4, newLine: 4 },
      { kind: "deletion", text: "-old", oldLine: 5, segments: [{ text: "old", changed: true }] },
      { kind: "addition", text: "+new", newLine: 5, segments: [{ text: "new", changed: true }] },
      { kind: "addition", text: "+more", newLine: 6 },
    ]);
  });

  it("keeps file headers out of addition and deletion styling", () => {
    const lines = parseUnifiedDiff("--- a/file.ts\n+++ b/file.ts");
    expect(lines.map((line) => line.kind)).toEqual(["header", "header"]);
  });

  it("marks only the changed portion of paired replacement lines", () => {
    const lines = parseUnifiedDiff("@@ -1 +1 @@\n-const model = 'low';\n+const model = 'high';");
    expect(lines[1].segments).toEqual([
      { text: "const model = '", changed: false },
      { text: "low", changed: true },
      { text: "';", changed: false },
    ]);
    expect(lines[2].segments).toEqual([
      { text: "const model = '", changed: false },
      { text: "high", changed: true },
      { text: "';", changed: false },
    ]);
  });
});
