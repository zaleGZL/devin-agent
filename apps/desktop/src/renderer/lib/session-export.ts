import type { ChatMessage } from "../../shared/conversation";
import { groupConversation, splitAssistantTurn } from "./conversation";

export function assistantResponseText(messages: ChatMessage[]): string {
  return splitAssistantTurn(messages, false).responses
    .map((response) => response.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function formatSessionMarkdown(title: string, messages: ChatMessage[]): string {
  const normalizedTitle = title.replace(/\s+/g, " ").trim() || "Devin session";
  const sections = groupConversation(messages).flatMap((group) => {
    if (group.type === "assistant") {
      const response = assistantResponseText(group.messages);
      return response ? [`## Devin\n\n${response}`] : [];
    }
    const body = userMessageMarkdown(group.message);
    return body ? [`## User\n\n${body}`] : [];
  });
  return [`# ${normalizedTitle}`, ...sections].join("\n\n").trimEnd() + "\n";
}

function userMessageMarkdown(message: ChatMessage): string {
  const parts = [message.text.trim()].filter(Boolean);
  message.images.forEach((image, index) => {
    const name = image.name?.replace(/[\r\n[\]]/g, " ").trim();
    parts.push(`*[Attached image ${index + 1}${name ? `: ${name}` : ""} (${image.mimeType})]*`);
  });
  return parts.join("\n\n");
}
