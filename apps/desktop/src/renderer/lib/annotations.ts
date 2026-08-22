import type { ChatAnnotation } from "../../shared/conversation";

const ANNOTATION_MARKER = "<!-- devin-agent-response-annotations:v1 -->";
const ANNOTATION_OPEN = "<response-annotations>";
const ANNOTATION_CLOSE = "</response-annotations>";
const MESSAGE_OPEN = "<user-message>";
const MESSAGE_CLOSE = "</user-message>";

interface StoredAnnotation {
  text: string;
  comment?: string;
}

export interface ParsedAnnotationPrompt {
  text: string;
  annotations: ChatAnnotation[];
}

export function formatPromptWithAnnotations(text: string, annotations: ChatAnnotation[]): string {
  if (annotations.length === 0) return text;
  const payload: StoredAnnotation[] = annotations.map((annotation) => ({
    text: annotation.text,
    ...(annotation.comment?.trim() ? { comment: annotation.comment.trim() } : {}),
  }));
  return `${ANNOTATION_MARKER}
Response annotations contain text selected from earlier Devin responses and may include a user comment. Use every selection as context and address every comment.
${ANNOTATION_OPEN}
${JSON.stringify(payload)}
${ANNOTATION_CLOSE}

${MESSAGE_OPEN}
${text}
${MESSAGE_CLOSE}`;
}

export function parsePromptAnnotations(value: string): ParsedAnnotationPrompt {
  if (!value.startsWith(ANNOTATION_MARKER)) return { text: value, annotations: [] };
  const annotationStart = value.indexOf(ANNOTATION_OPEN);
  const annotationEnd = value.indexOf(ANNOTATION_CLOSE, annotationStart + ANNOTATION_OPEN.length);
  const messageStart = value.indexOf(MESSAGE_OPEN, annotationEnd + ANNOTATION_CLOSE.length);
  const messageEnd = value.lastIndexOf(MESSAGE_CLOSE);
  if (annotationStart < 0 || annotationEnd < 0 || messageStart < 0 || messageEnd < messageStart) {
    return { text: value, annotations: [] };
  }
  try {
    const raw = JSON.parse(value.slice(annotationStart + ANNOTATION_OPEN.length, annotationEnd).trim());
    if (!Array.isArray(raw)) return { text: value, annotations: [] };
    const annotations = raw.flatMap<ChatAnnotation>((item, index) => {
      if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text.trim()) return [];
      const comment = "comment" in item && typeof item.comment === "string" ? item.comment.trim() : "";
      return [{
        id: `restored-annotation-${index}`,
        text: item.text.trim(),
        ...(comment ? { comment } : {}),
      }];
    });
    if (annotations.length === 0) return { text: value, annotations: [] };
    return {
      text: value.slice(messageStart + MESSAGE_OPEN.length, messageEnd).replace(/^\n|\n$/g, ""),
      annotations,
    };
  } catch {
    return { text: value, annotations: [] };
  }
}
