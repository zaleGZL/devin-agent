import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  InlineMentionEditor,
  inlineMentionEditorNeedsRender,
  type InlineMentionEditorHandle,
} from "./inline-mention-editor";

describe("InlineMentionEditor", () => {
  it("exposes an accessible multiline editor surface", () => {
    const html = renderToStaticMarkup(
      <InlineMentionEditor
        ref={createRef<InlineMentionEditorHandle>()}
        value="Review @README.md"
        mentions={[{ id: "file", kind: "file", label: "README.md", path: "README.md", start: 7, end: 17 }]}
        placeholder="Ask Devin"
        disabled={false}
        onChange={vi.fn()}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
        onCompositionStart={vi.fn()}
        onCompositionEnd={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    expect(html).toContain('role="textbox"');
    expect(html).toContain('aria-multiline="true"');
    expect(html).toContain('data-placeholder="Ask Devin"');
  });

  it("re-renders when a sent skill is still present in the editor DOM", () => {
    expect(inlineMentionEditorNeedsRender(
      { value: "", mentions: [] },
      ["skill:commit-all"],
      "",
      [],
    )).toBe(true);
  });
});
