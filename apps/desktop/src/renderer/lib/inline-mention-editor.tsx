import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { isEditorLineBreakInput, isImeCompositionKey } from "./ime";
import { mentionDisplayText, splitMentionText, type PositionedMention } from "./mentions";

export interface InlineMentionEditorHandle {
  focus(): void;
  getCaret(): number;
  setCaret(offset: number): void;
  insertText(text: string): void;
}

interface InlineMentionEditorProps {
  value: string;
  mentions: PositionedMention[];
  placeholder: string;
  disabled: boolean;
  onChange(value: string, mentions: PositionedMention[], caret: number): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onPaste(event: ClipboardEvent<HTMLDivElement>): void;
  onCompositionStart(): void;
  onCompositionEnd(value: string, mentions: PositionedMention[], caret: number): void;
  onBlur(): void;
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
}

export const InlineMentionEditor = forwardRef<InlineMentionEditorHandle, InlineMentionEditorProps>(function InlineMentionEditor({
  value,
  mentions,
  placeholder,
  disabled,
  onChange,
  onKeyDown,
  onPaste,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
  ...aria
}, forwardedRef) {
  const editorRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const compositionJustEnded = useRef(false);
  const compositionGuardTimer = useRef<number | undefined>(undefined);
  const pendingCaret = useRef<number | undefined>(undefined);

  const clearCompositionEndGuard = () => {
    compositionJustEnded.current = false;
    if (compositionGuardTimer.current !== undefined) window.clearTimeout(compositionGuardTimer.current);
    compositionGuardTimer.current = undefined;
  };

  const readValue = useCallback(() => {
    const editor = editorRef.current;
    return editor ? readInlineMentionEditor(editor, mentions) : { value, mentions, caret: value.length };
  }, [mentions, value]);

  const emitChange = useCallback(() => {
    const next = readValue();
    pendingCaret.current = next.caret;
    onChange(next.value, next.mentions, next.caret);
  }, [onChange, readValue]);

  const insertText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    insertEditorText(editor, text);
    emitChange();
  }, [emitChange]);

  useImperativeHandle(forwardedRef, () => ({
    focus() {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) setEditorCaret(editor, value.length);
    },
    getCaret() {
      const editor = editorRef.current;
      return editor ? getEditorCaret(editor) : value.length;
    },
    setCaret(offset: number) {
      const editor = editorRef.current;
      if (editor) setEditorCaret(editor, offset);
    },
    insertText,
  }), [insertText, value.length]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = readInlineMentionEditor(editor, mentions);
    const mentionStateMatches = current.mentions.length === mentions.length
      && current.mentions.every((mention, index) => {
        const expected = mentions[index];
        return expected?.id === mention.id && expected.start === mention.start && expected.end === mention.end;
      });
    if (current.value !== value || !mentionStateMatches) renderInlineMentionEditor(editor, value, mentions);
    if (pendingCaret.current !== undefined) {
      setEditorCaret(editor, pendingCaret.current);
      pendingCaret.current = undefined;
    }
  }, [mentions, value]);

  return (
    <div
      ref={editorRef}
      className="inline-mention-editor"
      contentEditable={!disabled}
      role="textbox"
      aria-multiline="true"
      aria-disabled={disabled || undefined}
      data-placeholder={placeholder}
      spellCheck
      onInput={() => { if (!composing.current) emitChange(); }}
      onBeforeInput={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (isEditorLineBreakInput(inputType)) event.preventDefault();
      }}
      onKeyDown={(event) => {
        const justEndedWithEnter = compositionJustEnded.current && event.key === "Enter";
        if (isImeCompositionKey(event.nativeEvent, composing.current, justEndedWithEnter)) {
          if (justEndedWithEnter) clearCompositionEndGuard();
          return;
        }
        onKeyDown(event);
      }}
      onPaste={(event) => {
        onPaste(event);
        if (event.defaultPrevented) return;
        const text = event.clipboardData.getData("text/plain");
        if (!text) return;
        event.preventDefault();
        insertText(text);
      }}
      onCompositionStart={() => {
        clearCompositionEndGuard();
        composing.current = true;
        onCompositionStart();
      }}
      onCompositionEnd={() => {
        composing.current = false;
        compositionJustEnded.current = true;
        compositionGuardTimer.current = window.setTimeout(clearCompositionEndGuard, 100);
        const next = readValue();
        pendingCaret.current = next.caret;
        onCompositionEnd(next.value, next.mentions, next.caret);
      }}
      onBlur={() => {
        composing.current = false;
        clearCompositionEndGuard();
        onBlur();
      }}
      {...aria}
    />
  );
});

function readInlineMentionEditor(
  editor: HTMLDivElement,
  mentions: readonly PositionedMention[],
): { value: string; mentions: PositionedMention[]; caret: number } {
  const byId = new Map(mentions.map((mention) => [mention.id, mention]));
  const positioned: PositionedMention[] = [];
  let value = "";

  const visit = (node: Node) => {
    if (node instanceof HTMLElement && node.dataset.mentionId) {
      const mention = byId.get(node.dataset.mentionId);
      if (!mention) return;
      const display = mentionDisplayText(mention);
      positioned.push({ ...mention, start: value.length, end: value.length + display.length });
      value += display;
      return;
    }
    if (node instanceof HTMLBRElement) {
      value += "\n";
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? "";
      return;
    }
    node.childNodes.forEach(visit);
  };
  editor.childNodes.forEach(visit);
  return { value, mentions: positioned, caret: getEditorCaret(editor) };
}

function renderInlineMentionEditor(editor: HTMLDivElement, value: string, mentions: readonly PositionedMention[]) {
  const fragment = document.createDocumentFragment();
  for (const segment of splitMentionText(value, mentions, false)) {
    if (segment.type === "text") {
      fragment.append(document.createTextNode(segment.text));
      continue;
    }
    const tag = document.createElement("span");
    tag.className = `composer-mention mention-${segment.mention.kind}`;
    tag.contentEditable = "false";
    tag.dataset.mentionId = segment.mention.id;
    const label = document.createElement("span");
    label.textContent = segment.text;
    tag.append(label);
    fragment.append(tag);
  }
  editor.replaceChildren(fragment);
}

function getEditorCaret(editor: HTMLDivElement): number {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return editor.textContent?.length ?? 0;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function setEditorCaret(editor: HTMLDivElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const target = Math.max(0, Math.min(offset, editor.textContent?.length ?? 0));
  const range = document.createRange();
  let consumed = 0;
  let placed = false;
  for (const [index, child] of Array.from(editor.childNodes).entries()) {
    const length = child.textContent?.length ?? 0;
    const mention = child instanceof HTMLElement && Boolean(child.dataset.mentionId);
    if (mention && target >= consumed && target <= consumed + length) {
      range.setStart(editor, target < consumed + length ? index : index + 1);
      placed = true;
      break;
    }
    if (!mention && child.nodeType === Node.TEXT_NODE && target <= consumed + length) {
      range.setStart(child, target - consumed);
      placed = true;
      break;
    }
    consumed += length;
  }
  if (!placed) range.selectNodeContents(editor), range.collapse(false);
  else range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertEditorText(editor: HTMLDivElement, text: string) {
  const selection = window.getSelection();
  if (!selection) return;
  let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
  if (!editor.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
