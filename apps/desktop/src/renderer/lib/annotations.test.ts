import { describe, expect, it } from "vitest";
import {
  formatPromptWithAnnotations,
  parsePromptAnnotations,
  prepareAnnotationSelection,
  writeSelectionToClipboardEvent,
} from "./annotations";

describe("response annotations", () => {
  it("leaves ordinary prompts unchanged", () => {
    expect(formatPromptWithAnnotations("Explain this", [])).toBe("Explain this");
    expect(parsePromptAnnotations("Explain this")).toEqual({ text: "Explain this", annotations: [] });
  });

  it("round-trips selected text and optional comments", () => {
    const wire = formatPromptWithAnnotations("Please revise it", [
      { id: "a", text: "First selection" },
      { id: "b", text: "Second selection", comment: "Make this concrete" },
    ]);
    expect(parsePromptAnnotations(wire)).toEqual({
      text: "Please revise it",
      annotations: [
        { id: "restored-annotation-0", text: "First selection" },
        { id: "restored-annotation-1", text: "Second selection", comment: "Make this concrete" },
      ],
    });
  });

  it("does not reinterpret malformed annotation envelopes", () => {
    const malformed = "<!-- devin-agent-response-annotations:v1 -->\n<response-annotations>oops";
    expect(parsePromptAnnotations(malformed)).toEqual({ text: malformed, annotations: [] });
  });

  it("preserves the original selection for copying", () => {
    expect(prepareAnnotationSelection("First line\n  second line")).toEqual({
      annotationText: "First line second line",
      clipboardText: "First line\n  second line",
    });
  });

  it("writes selected text to a native copy event", () => {
    const values = new Map<string, string>();
    let prevented = false;
    expect(writeSelectionToClipboardEvent({
      clipboardData: { setData: (type, value) => { values.set(type, value); } },
      preventDefault: () => { prevented = true; },
    }, "exact\nselection")).toBe(true);
    expect(values.get("text/plain")).toBe("exact\nselection");
    expect(prevented).toBe(true);
  });

  it("leaves the native copy path untouched without clipboard data", () => {
    let prevented = false;
    expect(writeSelectionToClipboardEvent({
      clipboardData: null,
      preventDefault: () => { prevented = true; },
    }, "selection")).toBe(false);
    expect(prevented).toBe(false);
  });
});
