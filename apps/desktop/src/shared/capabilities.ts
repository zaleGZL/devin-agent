import type { AvailableCommand, ConfigOptionState } from "./conversation";

type JsonRecord = Record<string, unknown>;

export interface PromptCapabilities {
  image?: boolean;
  audio?: boolean;
  embeddedContext?: boolean;
  [key: string]: unknown;
}

export interface SessionOperationCapabilities {
  new?: boolean;
  load?: boolean;
  list?: boolean;
  delete?: boolean;
  resume?: boolean;
  close?: boolean;
  cancel?: boolean;
  setMode?: boolean;
  setConfigOption?: boolean;
  additionalDirectories?: boolean;
  [key: string]: unknown;
}

export interface AuthCapability {
  methods: Array<{ id: string; name?: string; description?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface ModelCapability {
  id: string;
  name?: string;
  description?: string;
  supportsImages?: boolean;
  supportsAudio?: boolean;
  contextWindow?: number;
  raw?: unknown;
}

export interface ModeCapability {
  id: string;
  name?: string;
  description?: string;
  raw?: unknown;
}

export interface DevinCapabilities {
  protocolVersion?: string | number;
  prompt: PromptCapabilities;
  session: SessionOperationCapabilities;
  auth: AuthCapability;
  models: ModelCapability[];
  modes: ModeCapability[];
  configOptions: ConfigOptionState[];
  commands: AvailableCommand[];
  extensions: Record<string, unknown>;
  sandbox?: { available?: boolean; enforced?: boolean; reason?: string; raw?: unknown };
  permission?: { modes?: string[]; current?: string; raw?: unknown };
  unknown: Record<string, unknown>;
}

export type CapabilitySource = "runtime" | "command" | "unsupported";

export interface FeatureGate {
  id: FeatureId;
  enabled: boolean;
  reason?: string;
  source: CapabilitySource;
  cloud?: boolean;
}

export type FeatureId =
  | "handoff-cloud"
  | "subagents"
  | "checkpoint"
  | "steer"
  | "tool-diff"
  | "cost-precision"
  | "audio-input"
  | "editable-commands"
  | "command-revision"
  | "chain-sidechat"
  | "session-rename";

const UNSUPPORTED_REASONS: Record<Exclude<FeatureId, "handoff-cloud" | "subagents" | "audio-input" | "editable-commands" | "command-revision" | "chain-sidechat" | "session-rename">, string> = {
  checkpoint: "ACP 未提供原子 checkpoint/undo 能力",
  steer: "ACP v1 没有运行中 steer 方法",
  "tool-diff": "ACP 未保证完整工具 diff 数据",
  "cost-precision": "ACP usage 可能不包含可验证的精确 cost/cache 数据",
};

/** Convert initialize/session capability envelopes into a stable internal snapshot. */
export function normalizeDevinCapabilities(input: unknown = {}): DevinCapabilities {
  const root = isRecord(input) ? input : {};
  const nested = isRecord(root.agentCapabilities) ? root.agentCapabilities : isRecord(root.capabilities) ? root.capabilities : {};
  const source: JsonRecord = { ...root, ...nested };
  const prompt = normalizePrompt(source.promptCapabilities ?? source.prompt);
  const session = normalizeSession(source.sessionCapabilities ?? source.session);
  if (source.loadSession === true) session.load = true;
  const auth = normalizeAuth(source.auth ?? source.authentication ?? source.authenticationMethods);
  const models = normalizeModels(source.models ?? getConfigOption(source.configOptions, "model")?.options);
  const modes = normalizeModes(source.modes ?? getConfigOption(source.configOptions, "mode")?.options);
  const configOptions = normalizeConfigOptions(source.configOptions);
  const commands = normalizeCommands(source.availableCommands ?? source.commands);
  const extensionValue = source._meta ?? source.meta ?? source.extensions;
  const extensions = isRecord(extensionValue) ? { ...extensionValue } : {};
  const sandbox = normalizeSandbox(source.sandbox);
  const permission = normalizePermission(source.permission ?? source.permissions);
  return {
    ...(typeof source.protocolVersion === "string" || typeof source.protocolVersion === "number" ? { protocolVersion: source.protocolVersion } : {}),
    prompt,
    session,
    auth,
    models,
    modes,
    configOptions,
    commands,
    extensions,
    ...(sandbox ? { sandbox } : {}),
    ...(permission ? { permission } : {}),
    unknown: collectUnknown(source),
  };
}

export function mergeDevinCapabilities(base: DevinCapabilities, update: Partial<DevinCapabilities>): DevinCapabilities {
  return {
    ...base,
    ...update,
    prompt: { ...base.prompt, ...(update.prompt ?? {}) },
    session: { ...base.session, ...(update.session ?? {}) },
    auth: update.auth ?? base.auth,
    models: update.models ?? base.models,
    modes: update.modes ?? base.modes,
    configOptions: update.configOptions ?? base.configOptions,
    commands: update.commands ?? base.commands,
    extensions: { ...base.extensions, ...(update.extensions ?? {}) },
    unknown: { ...base.unknown, ...(update.unknown ?? {}) },
  };
}

export function supportsImagePrompt(capabilities: Pick<DevinCapabilities, "prompt">, model?: ModelCapability): boolean {
  return capabilities.prompt.image === true && model?.supportsImages === true;
}

export function supportsAudioPrompt(capabilities: Pick<DevinCapabilities, "prompt">, model?: ModelCapability): boolean {
  return capabilities.prompt.audio === true && model?.supportsAudio === true;
}

export function getModel(capabilities: DevinCapabilities, id: string | undefined): ModelCapability | undefined {
  return id ? capabilities.models.find((model) => model.id === id) : undefined;
}

export function getMode(capabilities: DevinCapabilities, id: string | undefined): ModeCapability | undefined {
  return id ? capabilities.modes.find((mode) => mode.id === id) : undefined;
}

export function getFeatureGate(capabilities: DevinCapabilities, id: FeatureId): FeatureGate {
  if (id === "handoff-cloud") {
    const command = findCommand(capabilities.commands, "handoff");
    return { id, enabled: Boolean(command), reason: command ? undefined : "当前 session 未广告 /handoff", source: command ? "command" : "runtime", cloud: true };
  }
  if (id === "subagents") {
    const command = capabilities.commands.some((entry) => /subagent/i.test(entry.name));
    const extension = Object.keys(capabilities.extensions).some((key) => /subagent/i.test(key));
    return { id, enabled: command || extension, reason: command || extension ? undefined : "ACP 未广告 Subagent 命令或事件", source: command || extension ? "runtime" : "unsupported" };
  }
  if (id === "audio-input") {
    return { id, enabled: capabilities.prompt.audio === true, reason: capabilities.prompt.audio ? undefined : "当前 ACP prompt capability 未广告 audio", source: capabilities.prompt.audio ? "runtime" : "unsupported" };
  }
  if (id === "editable-commands") return extensionGate(capabilities, id, "cognition.ai/editableCommands");
  if (id === "command-revision") return extensionGate(capabilities, id, "cognition.ai/commandRevision");
  if (id === "session-rename") return extensionGate(capabilities, id, "cognition.ai/sessionRename");
  if (id === "chain-sidechat") {
    const extension = extensionAdvertised(capabilities, "cognition.ai/chains");
    const command = commandIsAvailable(capabilities.commands, "btw");
    return {
      id,
      enabled: extension && command,
      reason: !extension ? "当前 Devin ACP 未广告 chains" : !command ? "当前 session 未广告 /btw" : undefined,
      source: extension && command ? "runtime" : "unsupported",
    };
  }
  return { id, enabled: false, reason: UNSUPPORTED_REASONS[id], source: "unsupported" };
}

export function extensionAdvertised(capabilities: Pick<DevinCapabilities, "extensions">, key: string): boolean {
  const value = capabilities.extensions[key];
  return value !== undefined && value !== null && value !== false;
}

function extensionGate(capabilities: DevinCapabilities, id: FeatureId, key: string): FeatureGate {
  const enabled = extensionAdvertised(capabilities, key);
  return { id, enabled, reason: enabled ? undefined : `当前 Devin ACP 未广告 ${key}`, source: enabled ? "runtime" : "unsupported" };
}

export function findCommand(commands: AvailableCommand[], name: string): AvailableCommand | undefined {
  const normalized = normalizeCommandName(name);
  return commands.find((command) => normalizeCommandName(command.name) === normalized);
}

export function commandIsAvailable(commands: AvailableCommand[], name: string): boolean {
  return Boolean(findCommand(commands, name));
}

export function normalizeCommandName(value: string): string {
  return value.trim().replace(/^\//, "").toLowerCase();
}

function normalizePrompt(value: unknown): PromptCapabilities {
  const source = isRecord(value) ? value : {};
  return {
    ...(typeof source.image === "boolean" ? { image: source.image } : typeof source.images === "boolean" ? { image: source.images } : {}),
    ...(typeof source.audio === "boolean" ? { audio: source.audio } : typeof source.audioInput === "boolean" ? { audio: source.audioInput } : {}),
    ...(typeof source.embeddedContext === "boolean" ? { embeddedContext: source.embeddedContext } : {}),
    ...source,
  };
}

function normalizeSession(value: unknown): SessionOperationCapabilities {
  const source = isRecord(value) ? value : {};
  const result: SessionOperationCapabilities = {};
  for (const key of ["new", "load", "list", "delete", "resume", "close", "cancel", "setMode", "setConfigOption", "additionalDirectories"]) {
    if (typeof source[key] === "boolean") result[key as keyof SessionOperationCapabilities] = source[key] as never;
    else if (source[key] !== undefined && source[key] !== null) result[key as keyof SessionOperationCapabilities] = true as never;
  }
  return { ...source, ...result };
}

function normalizeAuth(value: unknown): AuthCapability {
  const source = isRecord(value) ? value : {};
  const raw = Array.isArray(value) ? value : source.methods ?? source.authenticationMethods;
  const methods = Array.isArray(raw) ? raw.flatMap((item) => {
    if (typeof item === "string") return [{ id: item }];
    if (!isRecord(item)) return [];
    const id = stringValue(item.id ?? item.type ?? item.method);
    return id ? [{ id, ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}), ...(stringValue(item.description) ? { description: stringValue(item.description) } : {}), ...item }] : [];
  }) : [];
  return { ...source, methods };
}

function normalizeModels(value: unknown): ModelCapability[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ModelCapability>((entry) => {
    if (typeof entry === "string") return [{ id: entry }];
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id ?? entry.value ?? entry.modelId).trim();
    if (!id) return [];
    const meta = isRecord(entry._meta) ? entry._meta : {};
    const supportsImages = typeof entry.supportsImages === "boolean"
      ? entry.supportsImages
      : typeof entry.supports_images === "boolean"
        ? entry.supports_images
        : typeof meta["cognition.ai/supportsImages"] === "boolean"
          ? meta["cognition.ai/supportsImages"]
          : undefined;
    return [{ id, ...(stringValue(entry.name ?? entry.label) ? { name: stringValue(entry.name ?? entry.label) } : {}), ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}), ...(supportsImages !== undefined ? { supportsImages } : {}), ...(typeof entry.supportsAudio === "boolean" ? { supportsAudio: entry.supportsAudio } : {}), ...(typeof entry.contextWindow === "number" ? { contextWindow: entry.contextWindow } : {}), raw: entry }];
  });
}

function normalizeModes(value: unknown): ModeCapability[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ModeCapability>((entry) => {
    if (typeof entry === "string") return [{ id: entry }];
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id ?? entry.value ?? entry.modeId).trim();
    return id ? [{ id, ...(stringValue(entry.name ?? entry.label) ? { name: stringValue(entry.name ?? entry.label) } : {}), ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}), raw: entry }] : [];
  });
}

function normalizeConfigOptions(value: unknown): ConfigOptionState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ConfigOptionState>((entry) => {
    if (!isRecord(entry)) return [];
    const id = stringValue(entry.id ?? entry.configId).trim();
    if (!id) return [];
    const options = Array.isArray(entry.options) ? entry.options.flatMap((option) => {
      if (typeof option === "string") return [{ value: option }];
      if (!isRecord(option)) return [];
      const optionValue = stringValue(option.value ?? option.id).trim();
      const meta = isRecord(option._meta) ? option._meta : {};
      const supportsImages = typeof option.supportsImages === "boolean" ? option.supportsImages : typeof meta["cognition.ai/supportsImages"] === "boolean" ? meta["cognition.ai/supportsImages"] : undefined;
      return optionValue ? [{ value: optionValue, ...(stringValue(option.name ?? option.label) ? { name: stringValue(option.name ?? option.label) } : {}), ...(stringValue(option.description) ? { description: stringValue(option.description) } : {}), ...(supportsImages !== undefined ? { supportsImages } : {}), ...(typeof option.supportsAudio === "boolean" ? { supportsAudio: option.supportsAudio } : {}), ...(typeof option.contextWindow === "number" ? { contextWindow: option.contextWindow } : {}), raw: option }] : [];
    }) : [];
    const currentValue = entry.currentValue ?? entry.value;
    return [{ id, ...(stringValue(entry.name ?? entry.label) ? { name: stringValue(entry.name ?? entry.label) } : {}), ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}), ...(stringValue(entry.category) ? { category: stringValue(entry.category) } : {}), ...(stringValue(entry.type) ? { type: stringValue(entry.type) } : {}), ...(typeof currentValue === "string" || typeof currentValue === "boolean" || typeof currentValue === "number" ? { currentValue } : {}), ...(options.length > 0 ? { options } : {}) }];
  });
}

function normalizeCommands(value: unknown): AvailableCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<AvailableCommand>((entry) => {
    if (typeof entry === "string") return [{ name: entry }];
    if (!isRecord(entry)) return [];
    const name = stringValue(entry.name ?? entry.command).trim();
    const meta = isRecord(entry._meta) ? entry._meta : undefined;
    const category = stringValue(entry.category ?? meta?.["cognition.ai/category"]).trim();
    return name ? [{
      name,
      ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}),
      ...(Object.prototype.hasOwnProperty.call(entry, "input") ? { input: entry.input } : {}),
      ...(category ? { category } : {}),
      raw: entry,
    }] : [];
  });
}

function normalizeSandbox(value: unknown): DevinCapabilities["sandbox"] {
  if (!isRecord(value)) return undefined;
  return { ...(typeof value.available === "boolean" ? { available: value.available } : {}), ...(typeof value.enforced === "boolean" ? { enforced: value.enforced } : {}), ...(stringValue(value.reason) ? { reason: stringValue(value.reason) } : {}), raw: value };
}

function normalizePermission(value: unknown): DevinCapabilities["permission"] {
  if (!isRecord(value)) return undefined;
  const modes = Array.isArray(value.modes) ? value.modes.filter((mode): mode is string => typeof mode === "string") : undefined;
  return { ...(modes ? { modes } : {}), ...(stringValue(value.current) ? { current: stringValue(value.current) } : {}), raw: value };
}

function getConfigOption(value: unknown, id: string): ConfigOptionState | undefined {
  return normalizeConfigOptions(value).find((option) => option.id === id);
}

function collectUnknown(source: JsonRecord): Record<string, unknown> {
  const known = new Set(["protocolVersion", "promptCapabilities", "prompt", "sessionCapabilities", "session", "auth", "authentication", "authenticationMethods", "models", "modes", "configOptions", "availableCommands", "commands", "_meta", "meta", "extensions", "sandbox", "permission", "permissions"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
