export type DiffLineKind = "header" | "hunk" | "addition" | "deletion" | "context";

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
  segments?: DiffSegment[];
}

export function parseUnifiedDiff(content: string): DiffLine[] {
  let oldLine: number | undefined;
  let newLine: number | undefined;
  const lines: DiffLine[] = content.split("\n").map((text): DiffLine => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: "hunk", text };
    }
    if (text.startsWith("diff --git ") || text.startsWith("index ") || text.startsWith("--- ") || text.startsWith("+++ ") || text.startsWith("new file mode ") || text.startsWith("deleted file mode ") || text.startsWith("similarity index ") || text.startsWith("rename from ") || text.startsWith("rename to ")) {
      return { kind: "header", text };
    }
    if (text.startsWith("+")) {
      const line = { kind: "addition" as const, text, newLine };
      if (newLine !== undefined) newLine += 1;
      return line;
    }
    if (text.startsWith("-")) {
      const line = { kind: "deletion" as const, text, oldLine };
      if (oldLine !== undefined) oldLine += 1;
      return line;
    }
    if (text.startsWith(" ")) {
      const line = { kind: "context" as const, text, oldLine, newLine };
      if (oldLine !== undefined) oldLine += 1;
      if (newLine !== undefined) newLine += 1;
      return line;
    }
    return { kind: "header", text };
  });
  return addInlineChangeSegments(lines);
}

function inlineSegments(before: string, after: string): [DiffSegment[], DiffSegment[]] {
  let prefixLength = 0;
  const commonLength = Math.min(before.length, after.length);
  while (prefixLength < commonLength && before[prefixLength] === after[prefixLength]) prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < commonLength - prefixLength
    && before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) suffixLength += 1;

  const segments = (text: string): DiffSegment[] => {
    const prefix = text.slice(0, prefixLength);
    const changed = text.slice(prefixLength, text.length - suffixLength);
    const suffix = suffixLength > 0 ? text.slice(text.length - suffixLength) : "";
    return [
      ...(prefix ? [{ text: prefix, changed: false }] : []),
      ...(changed ? [{ text: changed, changed: true }] : []),
      ...(suffix ? [{ text: suffix, changed: false }] : []),
    ];
  };

  return [segments(before), segments(after)];
}

function addInlineChangeSegments(lines: DiffLine[]): DiffLine[] {
  const result = lines.map((line) => ({ ...line }));
  let index = 0;
  while (index < result.length) {
    if (result[index].kind !== "deletion") {
      index += 1;
      continue;
    }

    const deletions: number[] = [];
    while (index < result.length && result[index].kind === "deletion") deletions.push(index++);
    const additions: number[] = [];
    while (index < result.length && result[index].kind === "addition") additions.push(index++);
    const pairCount = Math.min(deletions.length, additions.length);
    for (let pair = 0; pair < pairCount; pair += 1) {
      const deletion = result[deletions[pair]];
      const addition = result[additions[pair]];
      [deletion.segments, addition.segments] = inlineSegments(deletion.text.slice(1), addition.text.slice(1));
    }
  }
  return result;
}
