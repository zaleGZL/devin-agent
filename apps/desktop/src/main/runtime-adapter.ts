import { normalizeDevinCapabilities, type DevinCapabilities } from "../shared/capabilities";
import type { AgentSnapshot, SessionSummary } from "../shared/types";

type JsonRecord = Record<string, unknown>;

export interface RuntimeSessionLike extends JsonRecord {
  sessionId?: string;
  cwd?: string;
  title?: string;
  updatedAt?: string | number;
  modes?: unknown;
  configOptions?: unknown[];
  isLocked?: boolean;
  _meta?: JsonRecord;
  raw?: JsonRecord;
}

export type RuntimeSessionOpenAction = "load" | "switch" | "reuse";

export function resolveRuntimeCommandSessionId(payload: JsonRecord, activeSessionId: unknown): string | undefined {
  const explicitSessionId = stringValue(payload.sessionId).trim();
  return explicitSessionId || stringValue(activeSessionId).trim() || undefined;
}

export function isRuntimePromptRunning(
  runningSessionIds: unknown,
  sessionId: string,
  activeSessionId: unknown,
  activePromptRunning: unknown,
): boolean {
  if (Array.isArray(runningSessionIds)) return runningSessionIds.includes(sessionId);
  return stringValue(activeSessionId) === sessionId && activePromptRunning === true;
}

/**
 * The ACP host knowing a session does not mean the renderer still owns its
 * transcript. A replay request must therefore win over the host's reuse
 * shortcut so session/load can emit the saved history again.
 */
export function resolveRuntimeSessionOpenAction(
  targetSessionId: string,
  activeSessionId: string | undefined,
  hasActiveSession: boolean,
  replaySession = false,
): RuntimeSessionOpenAction {
  if (replaySession) return "load";
  if (activeSessionId && activeSessionId !== targetSessionId) return "switch";
  return activeSessionId === targetSessionId && hasActiveSession ? "reuse" : "load";
}

/** Build the renderer snapshot exclusively from initialize + session results. */
export function buildAgentSnapshot(
  initializeCapabilities: unknown,
  session: RuntimeSessionLike,
  requestedModel?: string,
): AgentSnapshot {
  const initialize = isRecord(initializeCapabilities) ? initializeCapabilities : {};
  const initializeRaw = isRecord(initialize.raw) ? initialize.raw : initialize;
  const modesRecord = isRecord(session.modes) ? session.modes : {};
  const availableModes = Array.isArray(modesRecord.availableModes)
    ? modesRecord.availableModes
    : Array.isArray(session.modes)
      ? session.modes
      : [];
  const mergedInput = {
    ...initializeRaw,
    modes: availableModes,
    configOptions: Array.isArray(session.configOptions) ? session.configOptions : [],
    _meta: {
      ...(isRecord(initializeRaw._meta) ? initializeRaw._meta : {}),
      ...(isRecord(initialize.extensions) ? initialize.extensions : {}),
    },
  };
  const capabilities = normalizeDevinCapabilities(mergedInput);
  const modelOption = capabilities.configOptions.find((option) => option.id === "model");
  const modeOption = capabilities.configOptions.find((option) => option.id === "mode");
  const currentModel = requestedModel
    || (typeof modelOption?.currentValue === "string" ? modelOption.currentValue : undefined)
    || capabilities.models[0]?.id
    || "";
  const currentMode = stringValue(modesRecord.currentModeId)
    || (typeof modeOption?.currentValue === "string" ? modeOption.currentValue : undefined)
    || capabilities.modes[0]?.id
    || "";
  const locked = session.isLocked === true
    || session._meta?.isLocked === true
    || session._meta?.["cognition.ai/isLocked"] === true
    || (isRecord(session.raw?._meta) && (session.raw._meta.isLocked === true || session.raw._meta["cognition.ai/isLocked"] === true));

  return {
    state: {
      isStreaming: false,
      model: { provider: "devin", id: currentModel },
      modeId: currentMode,
      locked,
    },
    messages: [],
    models: capabilities.models.map((model) => ({
      provider: "devin",
      id: model.id,
      ...(model.name ? { name: model.name } : {}),
      ...(model.description ? { description: model.description } : {}),
      ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
      reasoning: true,
      supportsImages: model.supportsImages === true,
    })),
    thinkingLevels: [],
    sessionId: stringValue(session.sessionId) || undefined,
    modes: capabilities.modes,
    configOptions: capabilities.configOptions,
    capabilities,
    locked,
  };
}

/** Discover session-scoped selectors without retaining an empty user task. */
export async function buildCapabilityProbeSnapshot(
  initializeCapabilities: unknown,
  session: RuntimeSessionLike,
  deleteSession: (sessionId: string) => Promise<void>,
  requestedModel?: string,
): Promise<AgentSnapshot> {
  const snapshot = buildAgentSnapshot(initializeCapabilities, session, requestedModel);
  if (!snapshot.sessionId) throw new Error("Devin ACP capability discovery did not return a temporary session id");
  await deleteSession(snapshot.sessionId);
  delete snapshot.sessionId;
  snapshot.state.isStreaming = false;
  return snapshot;
}

export function mapRuntimeSessionSummary(value: unknown, fallbackCwd = ""): SessionSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.sessionId).trim();
  if (!id) return undefined;
  const rawMeta = isRecord(value._meta) ? value._meta : {};
  const cwd = stringValue(value.cwd) || fallbackCwd;
  const updatedAt = normalizeDate(value.updatedAt);
  const createdAt = normalizeDate(value.createdAt, updatedAt);
  return {
    id,
    path: id,
    cwd,
    title: stringValue(value.title) || id,
    titleSource: "server",
    titleUpdatedAt: updatedAt,
    createdAt,
    updatedAt,
    provider: "devin",
    locked: value.isLocked === true || rawMeta.isLocked === true || rawMeta["cognition.ai/isLocked"] === true,
    additionalDirectories: Array.isArray(value.additionalDirectories)
      ? value.additionalDirectories.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

export function permissionDecisionFromUi(response: unknown): { outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" } } {
  if (!isRecord(response)) return { outcome: { outcome: "cancelled" } };
  const optionId = stringValue(response.value).trim();
  return optionId
    ? { outcome: { outcome: "selected", optionId } }
    : { outcome: { outcome: "cancelled" } };
}

export function platformSandboxDiagnostic(platform: NodeJS.Platform): { available: boolean; message: string } {
  if (platform === "win32") {
    return { available: false, message: "Devin CLI 当前不支持 Windows OS sandbox；若组织强制 sandbox，会话将 fail-closed。" };
  }
  if (platform === "linux") {
    return { available: true, message: "Sandbox 由 Devin CLI 管理；Linux 需要 bubblewrap (bwrap) 与 socat，缺失时 CLI 会 fail-closed。" };
  }
  return { available: true, message: "Sandbox 与组织策略由 Devin CLI 管理；Desktop 不会回退到未隔离执行。" };
}

export function capabilitiesFromSnapshot(snapshot: AgentSnapshot): DevinCapabilities | undefined {
  return snapshot.capabilities;
}

function normalizeDate(value: unknown, fallback = new Date().toISOString()): string {
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
