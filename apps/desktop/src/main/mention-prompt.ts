import path from "node:path";
import { isUtf8 } from "node:buffer";
import fsp from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { PromptContent } from "../shared/acp-types";
import { parseMentionRefs, type MentionRef, type SkillMentionRef } from "../shared/mentions";
import { isPathInside } from "./desktop-security";

export const MAX_EMBEDDED_FILE_BYTES = 512 * 1024;

export interface MentionPromptOptions {
  workspaceRoot?: string;
  mentions: unknown;
  text: string;
  embeddedContext: boolean;
  availableSkills: readonly SkillMentionRef[];
}

export interface SerializedMentionPrompt {
  text: string;
  content: PromptContent[];
  mentions: MentionRef[];
}

export async function serializeMentionPrompt(options: MentionPromptOptions): Promise<SerializedMentionPrompt> {
  const mentions = parseMentionRefs(options.mentions);
  const skill = mentions.find((mention) => mention.kind === "skill");
  const content: PromptContent[] = [];
  const text = skill ? `${canonicalSkillCommand(skill.command, options.availableSkills)}\n${options.text}`.trim() : options.text;
  if (text) content.push({ type: "text", text });
  for (const mention of mentions) {
    if (mention.kind === "skill") continue;
    if (!options.workspaceRoot) throw new Error("Select a project before attaching files or directories");
    const resolved = await resolveWorkspaceMention(options.workspaceRoot, mention.path, mention.kind);
    const uri = pathToFileURL(resolved.absolutePath).href;
    if (mention.kind === "directory") {
      content.push({
        type: "resource_link",
        uri,
        name: `@${resolved.relativePath}/`,
        description: "Workspace directory (not recursively embedded)",
      });
      continue;
    }
    const stat = await fsp.stat(resolved.absolutePath);
    if (options.embeddedContext && stat.size <= MAX_EMBEDDED_FILE_BYTES) {
      const buffer = await fsp.readFile(resolved.absolutePath);
      if (isUtf8(buffer)) {
        content.push({
          type: "resource",
          resource: { uri, mimeType: mention.mimeType ?? "text/plain", text: buffer.toString("utf8") },
        });
        continue;
      }
    }
    content.push({
      type: "resource_link",
      uri,
      name: `@${resolved.relativePath}`,
      mimeType: mention.mimeType,
      size: stat.size,
    });
  }
  return { text, content, mentions };
}

export async function resolveWorkspaceMention(
  workspaceRoot: string,
  relativePath: string,
  kind: "file" | "directory",
): Promise<{ absolutePath: string; relativePath: string }> {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("Invalid workspace mention path");
  const root = await fsp.realpath(workspaceRoot);
  const requested = path.resolve(root, relativePath);
  if (!isPathInside(root, requested)) throw new Error("Mention path is outside the selected project");
  let target: string;
  try {
    target = await fsp.realpath(requested);
  } catch {
    throw new Error(`Mention target no longer exists: ${relativePath}`);
  }
  if (!isPathInside(root, target)) throw new Error("Mention target resolves outside the selected project");
  const stat = await fsp.stat(target);
  if (kind === "file" && !stat.isFile()) throw new Error(`Mention target is not a regular file: ${relativePath}`);
  if (kind === "directory" && !stat.isDirectory()) throw new Error(`Mention target is not a directory: ${relativePath}`);
  return { absolutePath: target, relativePath: path.relative(root, target).split(path.sep).join("/") };
}

function canonicalSkillCommand(command: string, availableSkills: readonly SkillMentionRef[]): string {
  const normalized = command.trim().replace(/^@skills:/i, "").replace(/^\//, "").toLocaleLowerCase();
  const matched = availableSkills.find((skill) => skill.command.toLocaleLowerCase() === normalized);
  if (!matched) throw new Error("This Skill is not available in the active Devin session snapshot");
  if (matched.conflictingSources?.length) {
    throw new Error(`Skill command "${matched.command}" is ambiguous; rename or remove one of its duplicate definitions`);
  }
  return `@skills:${matched.command}`;
}
