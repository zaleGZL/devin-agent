import { describe, expect, it } from "vitest";
import { isEditorLineBreakInput, isImeCompositionKey } from "./ime";

describe("isImeCompositionKey", () => {
  it("keeps editor shortcuts disabled while the composition lifecycle is active", () => {
    expect(isImeCompositionKey({ isComposing: false, key: "Enter", keyCode: 13 }, true)).toBe(true);
  });

  it("recognizes native composition events", () => {
    expect(isImeCompositionKey({ isComposing: true, key: "Enter", keyCode: 13 }, false)).toBe(true);
  });

  it("recognizes an unidentified legacy macOS composition key", () => {
    expect(isImeCompositionKey({ isComposing: false, key: "Process", keyCode: 229 }, false)).toBe(true);
  });

  it("does not treat a populated Doubao IME keyCode 229 event as composition by itself", () => {
    expect(isImeCompositionKey({ isComposing: false, key: "Enter", keyCode: 229 }, false)).toBe(false);
    expect(isImeCompositionKey({ isComposing: false, key: "a", keyCode: 229 }, false)).toBe(false);
  });

  it("suppresses the Enter delivered immediately after compositionend", () => {
    expect(isImeCompositionKey({ isComposing: false, key: "Enter", keyCode: 13 }, false, true)).toBe(true);
  });

  it("allows a normal Enter key after composition", () => {
    expect(isImeCompositionKey({ isComposing: false, key: "Enter", keyCode: 13 }, false)).toBe(false);
  });

  it("identifies native contenteditable line-break mutations", () => {
    expect(isEditorLineBreakInput("insertParagraph")).toBe(true);
    expect(isEditorLineBreakInput("insertLineBreak")).toBe(true);
    expect(isEditorLineBreakInput("insertCompositionText")).toBe(false);
    expect(isEditorLineBreakInput("insertText")).toBe(false);
  });
});
