import type { AvailableCommand } from "../../shared/conversation";
import type { DevinCapabilities, FeatureGate, FeatureId, ModelCapability } from "../../shared/capabilities";
import { commandIsAvailable, findCommand, getFeatureGate, getMode, getModel, normalizeCommandName, supportsAudioPrompt, supportsImagePrompt } from "../../shared/capabilities";

export { commandIsAvailable, findCommand, getFeatureGate, getMode, getModel, normalizeCommandName, supportsAudioPrompt, supportsImagePrompt };
export type { DevinCapabilities, FeatureGate, FeatureId, ModelCapability };

export interface CapabilitySelectorState {
  models: ModelCapability[];
  modes: DevinCapabilities["modes"];
  configOptions: DevinCapabilities["configOptions"];
  currentModelId?: string;
  currentModeId?: string;
}

export function buildCapabilitySelectorState(capabilities: DevinCapabilities, currentModelId?: string, currentModeId?: string): CapabilitySelectorState {
  return { models: capabilities.models, modes: capabilities.modes, configOptions: capabilities.configOptions, currentModelId, currentModeId };
}

export function visibleCommands(commands: AvailableCommand[], query = ""): AvailableCommand[] {
  const normalizedQuery = query.trim().replace(/^\//, "").toLowerCase();
  return commands.filter((command) => !normalizedQuery || `${command.name} ${command.description ?? ""}`.toLowerCase().includes(normalizedQuery));
}

export function commandPaletteItems(capabilities: DevinCapabilities, query = ""): AvailableCommand[] {
  return visibleCommands(capabilities.commands, query);
}

export function canUseSessionOperation(capabilities: DevinCapabilities, operation: keyof DevinCapabilities["session"]): boolean {
  return capabilities.session[operation] === true;
}

export interface ImageAttachmentGate {
  enabled: boolean;
  reason?: string;
}

export type PromptContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface PromptContentResult {
  content: PromptContentBlock[];
  rejectedImages: number;
  reason?: string;
}

export function imageAttachmentGate(capabilities: DevinCapabilities, modelId?: string): ImageAttachmentGate {
  const model = getModel(capabilities, modelId);
  if (capabilities.prompt.image !== true) return { enabled: false, reason: "当前 ACP session 未广告图片输入" };
  if (!model) return { enabled: false, reason: "当前 session 没有可验证的模型图片能力" };
  if (model.supportsImages !== true) return { enabled: false, reason: "当前模型不支持图片输入" };
  return { enabled: true };
}

/** Build ACP prompt blocks while enforcing both prompt and model image gates. */
export function buildPromptContent(
  text: string,
  images: Array<{ data: string; mimeType: string }>,
  capabilities: DevinCapabilities,
  modelId?: string,
): PromptContentResult {
  const content: PromptContentBlock[] = [];
  if (text.trim()) content.push({ type: "text", text });
  const gate = imageAttachmentGate(capabilities, modelId);
  const acceptedImages = gate.enabled ? images.filter((image) => image.mimeType.startsWith("image/") && image.data.length > 0) : [];
  content.push(...acceptedImages.map((image) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType })));
  const rejectedImages = images.length - acceptedImages.length;
  return { content, rejectedImages, ...(rejectedImages > 0 ? { reason: gate.reason ?? "图片附件无效" } : {}) };
}

export function handoffCommand(capabilities: DevinCapabilities): AvailableCommand | undefined {
  return findCommand(capabilities.commands, "handoff");
}
