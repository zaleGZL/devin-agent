import type { ElicitationContentValue, ElicitationSchema, JsonObject, PermissionOption } from "./acp-types";

export type ElicitationFieldType = "string" | "number" | "integer" | "boolean" | "array";

export interface ElicitationChoice {
  value: string;
  label: string;
  description?: string;
}

export interface ElicitationField {
  name: string;
  type: ElicitationFieldType;
  title: string;
  description?: string;
  required: boolean;
  defaultValue?: ElicitationContentValue;
  choices?: ElicitationChoice[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: "date" | "email" | "uri" | "date-time";
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

export interface ParsedElicitationForm {
  title?: string;
  description?: string;
  fields: ElicitationField[];
}

export type ElicitationParseResult =
  | { ok: true; form: ParsedElicitationForm }
  | { ok: false; reason: string };

export interface ElicitationValidationResult {
  ok: boolean;
  content: Record<string, ElicitationContentValue>;
  errors: Record<string, string>;
}

export interface InteractionContext {
  generation: number;
  sessionId?: string;
  toolCallId?: string;
  requestId?: string | number | null;
}

export type DesktopInteractionRequest =
  | ({
      kind: "permission";
      id: string;
      title: string;
      message: string;
      options: Array<{ id: string; label: string; description?: string }>;
      editableCommand?: { command: string };
      commandRevision?: { command: string; revision: number };
      raw: JsonObject;
    } & InteractionContext)
  | ({
      kind: "elicitation-form";
      id: string;
      message: string;
      form: ParsedElicitationForm;
    } & InteractionContext)
  | ({
      kind: "elicitation-url";
      id: string;
      message: string;
      elicitationId: string;
      url: string;
      origin: string;
    } & InteractionContext);

export type DesktopInteractionResponse =
  | { action: "select"; optionId: string; updatedCommand?: string }
  | { action: "revise"; instruction: string; revision: number }
  | { action: "accept"; content?: Record<string, ElicitationContentValue> }
  | { action: "open" }
  | { action: "decline" }
  | { action: "cancel" };

export function normalizePermissionOptions(options: PermissionOption[] | undefined): Array<{ id: string; label: string; description?: string }> {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    const id = stringValue(option.optionId ?? option.id).trim();
    if (!id) return [];
    return [{
      id,
      label: stringValue(option.label ?? option.name ?? option.optionId ?? option.id) || id,
      ...(stringValue(option.description) ? { description: stringValue(option.description) } : {}),
    }];
  });
}

export function parseElicitationFormSchema(schema: ElicitationSchema | undefined): ElicitationParseResult {
  if (!isRecord(schema) || (schema.type !== undefined && schema.type !== "object") || !isRecord(schema.properties)) {
    return { ok: false, reason: "elicitation schema 必须是包含 properties 的 object" };
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  const fields: ElicitationField[] = [];
  for (const [name, raw] of Object.entries(schema.properties)) {
    if (!isRecord(raw)) return { ok: false, reason: `字段 ${name} 的 schema 无效` };
    const type = raw.type;
    if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean" && type !== "array") {
      return { ok: false, reason: `字段 ${name} 使用不支持的类型` };
    }
    const choices = type === "string" ? stringChoices(raw) : type === "array" ? arrayChoices(raw) : undefined;
    if ((type === "array" && !choices) || (raw.enum !== undefined && !choices) || (raw.oneOf !== undefined && !choices)) {
      return { ok: false, reason: `字段 ${name} 的选项 schema 无效` };
    }
    if ((type === "number" || type === "integer") && boundedRangeInvalid(raw.minimum, raw.maximum)) {
      return { ok: false, reason: `字段 ${name} 的数值边界矛盾` };
    }
    if (type === "string" && boundedRangeInvalid(raw.minLength, raw.maxLength)) {
      return { ok: false, reason: `字段 ${name} 的长度边界矛盾` };
    }
    if (type === "array" && boundedRangeInvalid(raw.minItems, raw.maxItems)) {
      return { ok: false, reason: `字段 ${name} 的选项数量边界矛盾` };
    }
    if (typeof raw.pattern === "string") {
      try { new RegExp(raw.pattern); } catch { return { ok: false, reason: `字段 ${name} 的 pattern 无效` }; }
    }
    const defaultValue = normalizeValue(type, raw.default);
    if (raw.default !== undefined && raw.default !== null && defaultValue === undefined) {
      return { ok: false, reason: `字段 ${name} 的默认值类型无效` };
    }
    fields.push({
      name,
      type,
      title: stringValue(raw.title) || name,
      ...(stringValue(raw.description) ? { description: stringValue(raw.description) } : {}),
      required: required.has(name),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(choices ? { choices } : {}),
      ...(finiteNonNegative(raw.minLength) !== undefined ? { minLength: finiteNonNegative(raw.minLength) } : {}),
      ...(finiteNonNegative(raw.maxLength) !== undefined ? { maxLength: finiteNonNegative(raw.maxLength) } : {}),
      ...(stringValue(raw.pattern) ? { pattern: stringValue(raw.pattern) } : {}),
      ...(isFormat(raw.format) ? { format: raw.format } : {}),
      ...(finiteNumber(raw.minimum) !== undefined ? { minimum: finiteNumber(raw.minimum) } : {}),
      ...(finiteNumber(raw.maximum) !== undefined ? { maximum: finiteNumber(raw.maximum) } : {}),
      ...(finiteNonNegative(raw.minItems) !== undefined ? { minItems: finiteNonNegative(raw.minItems) } : {}),
      ...(finiteNonNegative(raw.maxItems) !== undefined ? { maxItems: finiteNonNegative(raw.maxItems) } : {}),
    });
  }
  if ([...required].some((name) => !fields.some((field) => field.name === name))) {
    return { ok: false, reason: "required 包含未定义字段" };
  }
  return {
    ok: true,
    form: {
      ...(stringValue(schema.title) ? { title: stringValue(schema.title) } : {}),
      ...(stringValue(schema.description) ? { description: stringValue(schema.description) } : {}),
      fields,
    },
  };
}

export function initialElicitationValues(form: ParsedElicitationForm): Record<string, ElicitationContentValue> {
  return Object.fromEntries(form.fields.flatMap((field) => field.defaultValue !== undefined
    ? [[field.name, field.defaultValue]]
    : field.type === "boolean"
      ? [[field.name, false]]
      : []));
}

export function validateElicitationValues(form: ParsedElicitationForm, input: Record<string, unknown>): ElicitationValidationResult {
  const content: Record<string, ElicitationContentValue> = {};
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    const raw = input[field.name];
    const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (field.required) errors[field.name] = "此字段为必填项";
      continue;
    }
    const value = normalizeValue(field.type, raw);
    if (value === undefined) {
      errors[field.name] = "值类型不符合字段要求";
      continue;
    }
    const error = validateField(field, value);
    if (error) errors[field.name] = error;
    else content[field.name] = value;
  }
  return { ok: Object.keys(errors).length === 0, content, errors };
}

export function parseSafeElicitationUrl(value: string): { url: string; origin: string } | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return { url: url.toString(), origin: url.origin };
  } catch {
    return undefined;
  }
}

function validateField(field: ElicitationField, value: ElicitationContentValue): string | undefined {
  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) return `至少输入 ${field.minLength} 个字符`;
    if (field.maxLength !== undefined && value.length > field.maxLength) return `最多输入 ${field.maxLength} 个字符`;
    if (field.pattern && !new RegExp(field.pattern).test(value)) return "输入格式不符合要求";
    if (field.format && !validFormat(field.format, value)) return "输入格式不符合要求";
  }
  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) return `值不能小于 ${field.minimum}`;
    if (field.maximum !== undefined && value > field.maximum) return `值不能大于 ${field.maximum}`;
  }
  if (Array.isArray(value)) {
    if (field.minItems !== undefined && value.length < field.minItems) return `至少选择 ${field.minItems} 项`;
    if (field.maxItems !== undefined && value.length > field.maxItems) return `最多选择 ${field.maxItems} 项`;
  }
  if (field.choices) {
    const allowed = new Set(field.choices.map((choice) => choice.value));
    if (Array.isArray(value) ? value.some((item) => !allowed.has(item)) : typeof value === "string" && !allowed.has(value)) return "选择值不在允许范围内";
  }
  return undefined;
}

function normalizeValue(type: ElicitationFieldType, value: unknown): ElicitationContentValue | undefined {
  if (type === "string") return typeof value === "string" ? value : undefined;
  if (type === "number") return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
  if (type === "boolean") return typeof value === "boolean" ? value : undefined;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function stringChoices(schema: JsonObject): ElicitationChoice[] | undefined {
  if (Array.isArray(schema.oneOf)) {
    const choices = schema.oneOf.flatMap((entry) => isRecord(entry) && typeof entry.const === "string" && typeof entry.title === "string" ? [{ value: entry.const, label: entry.title, ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}) }] : []);
    return choices.length === schema.oneOf.length ? choices : undefined;
  }
  if (Array.isArray(schema.enum) && schema.enum.every((entry) => typeof entry === "string")) return schema.enum.map((entry) => ({ value: entry, label: entry }));
  return undefined;
}

function arrayChoices(schema: JsonObject): ElicitationChoice[] | undefined {
  if (!isRecord(schema.items)) return undefined;
  if (Array.isArray(schema.items.anyOf)) {
    const choices = schema.items.anyOf.flatMap((entry) => isRecord(entry) && typeof entry.const === "string" && typeof entry.title === "string" ? [{ value: entry.const, label: entry.title, ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {}) }] : []);
    return choices.length === schema.items.anyOf.length ? choices : undefined;
  }
  if (schema.items.type === "string" && Array.isArray(schema.items.enum) && schema.items.enum.every((entry) => typeof entry === "string")) return schema.items.enum.map((entry) => ({ value: entry, label: entry }));
  return undefined;
}

function validFormat(format: NonNullable<ElicitationField["format"]>, value: string): boolean {
  if (format === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (format === "uri") { try { new URL(value); return true; } catch { return false; } }
  if (format === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  return !Number.isNaN(Date.parse(value));
}

function boundedRangeInvalid(minimum: unknown, maximum: unknown): boolean {
  const min = finiteNumber(minimum);
  const max = finiteNumber(maximum);
  return min !== undefined && max !== undefined && min > max;
}

function isFormat(value: unknown): value is NonNullable<ElicitationField["format"]> {
  return value === "date" || value === "email" || value === "uri" || value === "date-time";
}

function finiteNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function finiteNonNegative(value: unknown): number | undefined { const number = finiteNumber(value); return number !== undefined && number >= 0 ? number : undefined; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function isRecord(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
