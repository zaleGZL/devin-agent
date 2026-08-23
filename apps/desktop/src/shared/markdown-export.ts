export const MARKDOWN_EXPORT_MAX_CHARACTERS = 16_000_000;

export interface MarkdownExportRequest {
  defaultName: string;
  content: string;
}

export interface MarkdownExportResult {
  saved: boolean;
  filePath?: string;
}

export function markdownExportFileName(title: string): string {
  const baseName = title
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 100)
    .trim();
  return `${baseName || "devin-session"}.md`;
}

export function parseMarkdownExportRequest(value: unknown): MarkdownExportRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Markdown export request");
  const request = value as Record<string, unknown>;
  if (typeof request.defaultName !== "string" || request.defaultName.length === 0 || request.defaultName.length > 240) {
    throw new Error("Invalid Markdown export file name");
  }
  if (typeof request.content !== "string" || request.content.length === 0 || request.content.length > MARKDOWN_EXPORT_MAX_CHARACTERS) {
    throw new Error("Invalid Markdown export content");
  }
  return {
    defaultName: markdownExportFileName(request.defaultName),
    content: request.content,
  };
}
