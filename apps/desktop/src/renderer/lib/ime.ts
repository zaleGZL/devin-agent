type ImeKeyboardEvent = Pick<globalThis.KeyboardEvent, "isComposing" | "key" | "keyCode">;

/**
 * Chromium/WebKit can report isComposing=false on the key that confirms a
 * macOS IME candidate. Treat keyCode 229 as a fallback only when the key is
 * unidentified: some macOS IMEs report 229 for every ordinary key press.
 */
export function isImeCompositionKey(
  event: ImeKeyboardEvent,
  composing: boolean,
  compositionJustEnded = false,
): boolean {
  const unidentifiedLegacyCompositionKey = event.keyCode === 229
    && (event.key === "" || event.key === "Process" || event.key === "Unidentified");
  return composing || compositionJustEnded || event.isComposing || unidentifiedLegacyCompositionKey;
}

/** Native paragraph insertion is never used; Enter sends and Shift+Enter inserts text explicitly. */
export function isEditorLineBreakInput(inputType: string): boolean {
  return inputType === "insertParagraph" || inputType === "insertLineBreak";
}
