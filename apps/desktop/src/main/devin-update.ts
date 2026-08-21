import { spawn } from "node:child_process";
import type { DevinCliUpdateStatus } from "../shared/types";
import {
  compareVersions,
  parseDevinVersion,
  sanitizeChildEnv,
  validateDevinBinary,
} from "./devin-discovery";

export const DEVIN_RELEASE_MANIFEST_URL = "https://static.devin.ai/cli/current/manifest.json";

const DEFAULT_CHECK_TIMEOUT_MS = 15_000;
const DEFAULT_UPDATE_TIMEOUT_MS = 10 * 60_000;
const MAX_UPDATE_OUTPUT_BYTES = 64 * 1024;

type ManifestResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type ManifestFetcher = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<ManifestResponse>;

export interface DevinCliUpdateOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  checkTimeoutMs?: number;
  updateTimeoutMs?: number;
  fetchManifest?: ManifestFetcher;
  runUpdater?: (invocation: UpdateInvocation, options: RunUpdaterOptions) => Promise<string>;
  validateBinary?: typeof validateDevinBinary;
}

export interface UpdateInvocation {
  command: string;
  args: string[];
}

export interface RunUpdaterOptions {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export async function checkDevinCliUpdate(
  executablePath: string,
  options: DevinCliUpdateOptions = {},
): Promise<DevinCliUpdateStatus> {
  const binary = await (options.validateBinary ?? validateDevinBinary)(executablePath, { env: options.env });
  const latestVersion = await fetchLatestDevinVersion(options);
  return createUpdateStatus(binary.version, latestVersion);
}

export async function installDevinCliUpdate(
  executablePath: string,
  expectedLatestVersion: string,
  options: DevinCliUpdateOptions = {},
): Promise<DevinCliUpdateStatus> {
  const validateBinary = options.validateBinary ?? validateDevinBinary;
  const before = await validateBinary(executablePath, { env: options.env });
  if (compareVersions(before.version, expectedLatestVersion) >= 0) {
    return createUpdateStatus(before.version, expectedLatestVersion);
  }

  const invocation = buildUpdateInvocation(options.platform ?? process.platform, before.path);
  const output = await (options.runUpdater ?? runUpdater)(invocation, {
    env: sanitizeChildEnv(options.env ?? process.env),
    timeoutMs: options.updateTimeoutMs ?? DEFAULT_UPDATE_TIMEOUT_MS,
  });
  const after = await validateBinary(executablePath, { env: options.env });
  if (compareVersions(after.version, expectedLatestVersion) < 0) {
    const detail = lastMeaningfulLine(output);
    throw new Error(detail || `Devin CLI 更新未完成，当前仍为 ${after.version}`);
  }
  return createUpdateStatus(after.version, expectedLatestVersion);
}

export async function fetchLatestDevinVersion(
  options: DevinCliUpdateOptions = {},
): Promise<string> {
  const signal = AbortSignal.timeout(options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS);
  const fetchManifest = options.fetchManifest ?? (globalThis.fetch as ManifestFetcher);
  let response: ManifestResponse;
  try {
    response = await fetchManifest(DEVIN_RELEASE_MANIFEST_URL, { signal });
  } catch (error) {
    if (signal.aborted) throw new Error("检查 Devin CLI 更新超时");
    throw new Error(`无法查询 Devin CLI 最新版本：${safeMessage(error)}`);
  }
  if (!response.ok) throw new Error(`无法查询 Devin CLI 最新版本（HTTP ${response.status}）`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Devin CLI 版本服务返回了无效数据");
  }
  return parseReleaseManifest(payload);
}

export function parseReleaseManifest(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.version !== "string") {
    throw new Error("Devin CLI 版本服务缺少版本号");
  }
  const version = parseDevinVersion(payload.version);
  if (!version || version !== payload.version.replace(/^v/, "")) {
    throw new Error("Devin CLI 版本服务返回了无效版本号");
  }
  return version;
}

export function createUpdateStatus(currentVersion: string, latestVersion: string): DevinCliUpdateStatus {
  return {
    currentVersion,
    latestVersion,
    state: compareVersions(currentVersion, latestVersion) < 0 ? "available" : "latest",
    checkedAt: new Date().toISOString(),
  };
}

export function buildUpdateInvocation(platform: NodeJS.Platform, executablePath: string): UpdateInvocation {
  if (platform === "darwin") {
    return {
      command: "/usr/bin/script",
      args: ["-q", "/dev/null", executablePath, "update"],
    };
  }
  if (platform === "linux") {
    return {
      command: "script",
      args: ["-q", "-e", "-c", `${quotePosix(executablePath)} update`, "/dev/null"],
    };
  }
  if (platform === "win32") {
    return { command: executablePath, args: ["update"] };
  }
  throw new Error(`当前系统不支持应用内更新 Devin CLI：${platform}`);
}

async function runUpdater(invocation: UpdateInvocation, options: RunUpdaterOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env: { ...options.env, TERM: options.env.TERM || "xterm-256color", NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });
    let output = "";
    let settled = false;
    const append = (chunk: Buffer | string) => {
      if (output.length >= MAX_UPDATE_OUTPUT_BYTES) return;
      output += chunk.toString().slice(0, MAX_UPDATE_OUTPUT_BYTES - output.length);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Devin CLI 更新超时"));
    }, options.timeoutMs);
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 Devin CLI 更新：${safeMessage(error)}`));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const cleaned = cleanProcessOutput(output);
      if (code !== 0) {
        reject(new Error(lastMeaningfulLine(cleaned) || `Devin CLI 更新失败（退出码 ${code ?? "unknown"}）`));
      } else {
        resolve(cleaned);
      }
    });
  });
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function cleanProcessOutput(value: string): string {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lastMeaningfulLine(value: string): string {
  return cleanProcessOutput(value).split("\n").map((line) => line.trim()).filter(Boolean).at(-1)?.slice(0, 500) ?? "";
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 300) : "未知错误";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
