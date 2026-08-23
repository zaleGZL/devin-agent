import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/conversation";
import { assistantResponseText, formatSessionMarkdown } from "./session-export";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message",
    role: "assistant",
    text: "",
    images: [],
    tools: [],
    work: [],
    ...overrides,
  };
}

describe("session Markdown export", () => {
  it("copies only visible response text from an assistant turn", () => {
    const turn = [message({
      text: "Final answer",
      thinking: "private reasoning",
      tools: [{ id: "tool", name: "read", title: "Read file", status: "complete" }],
      work: [
        { type: "thinking", id: "thought", text: "private reasoning" },
        { type: "tool", id: "tool-work", toolId: "tool" },
        { type: "text", id: "response", text: "Final answer" },
      ],
    })];

    expect(assistantResponseText(turn)).toBe("Final answer");
  });

  it("exports the complete visible conversation in chronological Markdown sections", () => {
    const messages = [
      message({ id: "user", role: "user", text: "Review this", images: [{ data: "aW1hZ2U=", mimeType: "image/png", name: "screen.png" }], work: [{ type: "text", id: "user-text", text: "Review this" }] }),
      message({ id: "assistant-1", text: "First paragraph", work: [{ type: "text", id: "first", text: "First paragraph" }] }),
      message({ id: "assistant-2", text: "Second paragraph", work: [{ type: "text", id: "second", text: "Second paragraph" }] }),
      message({ id: "user-2", role: "user", text: "Thanks", work: [{ type: "text", id: "thanks", text: "Thanks" }] }),
    ];

    expect(formatSessionMarkdown("ACP session", messages)).toBe(
      "# ACP session\n\n"
      + "## User\n\nReview this\n\n*[Attached image 1: screen.png (image/png)]*\n\n"
      + "## Devin\n\nFirst paragraph\n\nSecond paragraph\n\n"
      + "## User\n\nThanks\n",
    );
  });
});
