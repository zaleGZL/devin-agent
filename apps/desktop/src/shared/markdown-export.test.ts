import { describe, expect, it } from "vitest";
import { markdownExportFileName, parseMarkdownExportRequest } from "./markdown-export";

describe("Markdown export contract", () => {
  it("builds a portable Markdown file name without discarding Unicode", () => {
    expect(markdownExportFileName("  调研: Devin / ACP?.md  ")).toBe("调研 Devin ACP.md");
    expect(markdownExportFileName("..." )).toBe("devin-session.md");
  });

  it("normalizes renderer requests and rejects invalid content", () => {
    expect(parseMarkdownExportRequest({ defaultName: "Session.md", content: "# Session\n" })).toEqual({
      defaultName: "Session.md",
      content: "# Session\n",
    });
    expect(() => parseMarkdownExportRequest({ defaultName: "Session.md", content: "" })).toThrow("Invalid Markdown export content");
    expect(() => parseMarkdownExportRequest({ defaultName: "Session.md", content: "x".repeat(16_000_001) })).toThrow("Invalid Markdown export content");
  });
});
