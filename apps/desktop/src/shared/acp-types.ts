/**
 * Minimal, dependency-free ACP v1 wire types.
 *
 * The official ACP SDK can consume these values as well.  Keeping the wire
 * envelope in the application lets the main process preserve Devin-specific
 * `_meta` fields without leaking an SDK implementation detail to the
 * renderer.
 */

export type JsonPrimitive = string | number | boolean | null;
/**
 * JSON values at the ACP boundary are intentionally permissive. Generated
 * ACP SDK types are stricter for known methods, while Devin `_meta` and future
 * extension payloads are open objects; `JsonObject` therefore uses an `any`
 * index only at this untrusted wire boundary.
 */
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject | undefined;
export type JsonObject = { [key: string]: any };
export type RpcId = string | number;

export interface JsonRpcRequest<TParams = JsonValue> {
  jsonrpc: "2.0";
  id: RpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = JsonValue> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = JsonValue> {
  jsonrpc: "2.0";
  id: RpcId;
  result: TResult;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: RpcId | null;
  error: JsonRpcErrorBody;
}

export type JsonRpcResponse<TResult = JsonValue> =
  | JsonRpcSuccess<TResult>
  | JsonRpcFailure;

export interface ClientInfo {
  name: string;
  version: string;
}

export interface ClientCapabilities extends JsonObject {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
    [key: string]: JsonValue | undefined;
  };
  terminal?: JsonValue;
  elicitation?: {
    form?: JsonObject;
    url?: JsonObject;
    [key: string]: JsonValue | undefined;
  };
  [key: string]: JsonValue | undefined;
}

export interface InitializeParams extends JsonObject {
  protocolVersion: number;
  clientCapabilities: ClientCapabilities;
  clientInfo: ClientInfo;
  _meta?: JsonObject;
}

export interface DevinClientFeatureSupport {
  elicitationForm: boolean;
  elicitationUrl: boolean;
  chains: boolean;
}

export interface DevinClientAdvertisement {
  clientCapabilities: ClientCapabilities;
}

export const DEVIN_DESKTOP_CLIENT_FEATURES: DevinClientFeatureSupport = {
  elicitationForm: true,
  elicitationUrl: true,
  chains: true,
};

/** Build initialize fields only from client handlers compiled into Desktop. */
export function buildDevinClientAdvertisement(
  support: Partial<DevinClientFeatureSupport> = DEVIN_DESKTOP_CLIENT_FEATURES,
): DevinClientAdvertisement {
  const resolved = { ...DEVIN_DESKTOP_CLIENT_FEATURES, ...support };
  const elicitation = {
    ...(resolved.elicitationForm ? { form: {} } : {}),
    ...(resolved.elicitationUrl ? { url: {} } : {}),
  };
  const clientMeta = {
    ...(resolved.chains ? { "cognition.ai/chains": true } : {}),
  };
  return {
    clientCapabilities: {
      ...(Object.keys(elicitation).length > 0 ? { elicitation } : {}),
      ...(Object.keys(clientMeta).length > 0 ? { _meta: clientMeta } : {}),
    },
  };
}

export interface AuthMethod extends JsonObject {
  /** ACP uses `id` in some versions and `methodId` in others. */
  id?: string;
  methodId?: string;
  name?: string;
  description?: string;
  type?: string;
}

export interface PromptCapabilities extends JsonObject {
  image?: boolean;
  audio?: boolean;
  embeddedContext?: boolean;
  [key: string]: JsonValue | undefined;
}

export interface SessionCapabilityMap extends JsonObject {
  list?: JsonValue;
  load?: JsonValue;
  delete?: JsonValue;
  resume?: JsonValue;
  close?: JsonValue;
  fork?: JsonValue;
  additionalDirectories?: JsonValue;
  [key: string]: JsonValue | undefined;
}

export interface AgentCapabilities extends JsonObject {
  loadSession?: boolean;
  promptCapabilities?: PromptCapabilities;
  sessionCapabilities?: SessionCapabilityMap;
  [key: string]: JsonValue | undefined;
}

export interface InitializeResult extends JsonObject {
  protocolVersion?: number;
  agentInfo?: JsonObject;
  agentCapabilities?: AgentCapabilities;
  capabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
  _meta?: JsonObject;
}

export interface DevinCapabilities {
  protocolVersion: number | null;
  agentInfo: JsonObject | null;
  promptCapabilities: PromptCapabilities;
  sessionCapabilities: SessionCapabilityMap;
  supportsLoadSession: boolean;
  authMethods: AuthMethod[];
  extensions: JsonObject;
  raw: InitializeResult;
}

export interface SessionSummary extends JsonObject {
  sessionId: string;
  cwd?: string;
  title?: string;
  updatedAt?: string | number;
  additionalDirectories?: string[];
  /** Devin currently exposes this as `_meta.isLocked`; direct `isLocked` is
   * accepted for fixtures and future ACP revisions. */
  isLocked?: boolean;
  _meta?: JsonObject;
}

export interface SessionListResult extends JsonObject {
  sessions: SessionSummary[];
  nextCursor?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface SessionCreateParams extends JsonObject {
  cwd: string;
  mcpServers?: JsonValue[];
  additionalDirectories?: string[];
}

export interface SessionLoadParams extends JsonObject {
  sessionId: string;
  cwd?: string;
  mcpServers?: JsonValue[];
  additionalDirectories?: string[];
}

export interface SessionPromptContentText {
  type: "text";
  text: string;
}

export interface SessionPromptContentImage extends JsonObject {
  type: "image";
  data: string;
  mimeType: string;
}

export interface SessionPromptContentResource extends JsonObject {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    [key: string]: JsonValue | undefined;
  };
}

export interface SessionPromptContentResourceLink extends JsonObject {
  type: "resource_link";
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export type PromptContent =
  | SessionPromptContentText
  | SessionPromptContentImage
  | SessionPromptContentResource
  | SessionPromptContentResourceLink
  | JsonObject;

export interface PromptParams extends JsonObject {
  sessionId: string;
  prompt: PromptContent[];
}

export interface PermissionOption extends JsonObject {
  optionId?: string;
  id?: string;
  name?: string;
  label?: string;
  description?: string;
}

export interface PermissionRequest extends JsonObject {
  sessionId?: string;
  toolCall?: JsonObject;
  options?: PermissionOption[];
  [key: string]: JsonValue | undefined;
}

export interface PermissionDecision extends JsonObject {
  outcome:
    | { outcome: "selected"; optionId: string }
    | { outcome: "cancelled"; [key: string]: JsonValue | undefined }
    | JsonObject;
  [key: string]: JsonValue;
}

export type ElicitationContentValue = string | number | boolean | string[];

export interface ElicitationSchema extends JsonObject {
  type?: "object";
  title?: string | null;
  description?: string | null;
  properties?: Record<string, JsonObject>;
  required?: string[] | null;
}

export type ElicitationRequest = JsonObject & {
  mode: string;
  message: string;
  sessionId?: string;
  toolCallId?: string | null;
  requestId?: RpcId | null;
  requestedSchema?: ElicitationSchema;
  elicitationId?: string;
  url?: string;
};

export type ElicitationResponse =
  | { action: "accept"; content?: Record<string, ElicitationContentValue> | null; _meta?: JsonObject }
  | { action: "decline"; _meta?: JsonObject }
  | { action: "cancel"; _meta?: JsonObject };

export interface ElicitationCompleteNotification extends JsonObject {
  elicitationId: string;
}

export interface SessionUpdateEnvelope extends JsonObject {
  sessionId?: string;
  update?: JsonObject;
  /** Some ACP clients pass the update object directly under params. */
  [key: string]: JsonValue | undefined;
}

export interface AvailableCommand extends JsonObject {
  name?: string;
  command?: string;
  description?: string;
  input?: JsonValue;
}

export type AcpServerRequest =
  | { method: "session/request_permission"; params: PermissionRequest }
  | { method: "elicitation/create"; params: ElicitationRequest }
  | { method: string; params: JsonValue };

export function asJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function capabilityAdvertised(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/**
 * Return only the known, non-secret values from an unknown diagnostic payload.
 * It intentionally keeps object shape so unknown Devin extensions remain
 * useful during development without exposing credentials to renderer/logs.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 16) return "[Truncated]";
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/(api[_-]?key|token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry, depth + 1));
  if (!isJsonObject(value)) return value;

  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/token|secret|password|credential|authorization|api[_-]?key/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactSensitive(entry, depth + 1) as JsonValue;
    }
  }
  return output;
}

export function normalizeAuthMethodId(method: AuthMethod): string | undefined {
  return asString(method.methodId) ?? asString(method.id);
}

export function getSessionLocked(summary: SessionSummary): boolean {
  if (typeof summary.isLocked === "boolean") return summary.isLocked;
  return summary._meta?.isLocked === true || summary._meta?.["cognition.ai/isLocked"] === true;
}
