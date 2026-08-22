import { access, constants, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";

export type DevinBinarySource = "configured" | "path" | "common";

export interface DevinBinaryInfo {
  path: string;
  version: string;
  rawVersion: string;
  source: DevinBinarySource;
}

export interface DevinDiscoveryOptions {
  /** A user-selected path. Relative paths are rejected by design. */
  configuredPath?: string;
  /** Test/embedded environments may provide a deterministic PATH. */
  pathValue?: string;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  minVersion?: string;
  /** Override process execution in tests without changing production safety. */
  runVersion?: (path: string, options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<string>;
}

export interface DevinDiscoveryFailure {
  path: string;
  source: DevinBinarySource;
  reason: string;
}

export class DevinBinaryError extends Error {
  readonly code: "not-found" | "not-absolute" | "not-executable" | "version" | "incompatible";
  readonly failures: DevinDiscoveryFailure[];

  constructor(
    code: DevinBinaryError["code"],
    message: string,
    failures: DevinDiscoveryFailure[] = [],
  ) {
    super(message);
    this.name = "DevinBinaryError";
    this.code = code;
    this.failures = failures;
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Discover an independently installed Devin CLI without invoking a shell.
 * Candidate ordering is deterministic: user path, PATH, then documented
 * common install locations. Every candidate is normalized to an absolute path
 * before it is executed.
 */
export async function discoverDevinBinary(
  options: DevinDiscoveryOptions = {},
): Promise<DevinBinaryInfo> {
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? homedir();
  const env = options.env ?? process.env;
  const failures: DevinDiscoveryFailure[] = [];
  const candidates = collectCandidates({
    configuredPath: options.configuredPath ?? env.DEVIN_CLI_PATH,
    pathValue: options.pathValue ?? env.PATH,
    platform,
    homeDirectory,
  });

  for (const candidate of candidates) {
    if (!isAbsolute(candidate.path)) {
      failures.push({
        path: candidate.path,
        source: candidate.source,
        reason: "候选路径必须是绝对路径",
      });
      continue;
    }

    try {
      const info = await validateDevinBinary(candidate.path, {
        timeoutMs: options.timeoutMs,
        minVersion: options.minVersion,
        env,
        runVersion: options.runVersion,
      });
      return { ...info, source: candidate.source };
    } catch (error) {
      failures.push({
        path: candidate.path,
        source: candidate.source,
        reason: toSafeErrorMessage(error),
      });
    }
  }

  const configured = candidates.find((candidate) => candidate.source === "configured");
  const code: DevinBinaryError["code"] = configured && failures.length === 1
    ? "version"
    : "not-found";
  throw new DevinBinaryError(
    code,
    "未找到可用的 Devin CLI。请安装 Devin CLI，或在设置中选择绝对路径。",
    failures,
  );
}

export interface ValidateDevinBinaryOptions {
  timeoutMs?: number;
  minVersion?: string;
  env?: NodeJS.ProcessEnv;
  runVersion?: (path: string, options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<string>;
}

export async function validateDevinBinary(
  executablePath: string,
  options: ValidateDevinBinaryOptions = {},
): Promise<Omit<DevinBinaryInfo, "source">> {
  if (!isAbsolute(executablePath)) {
    throw new DevinBinaryError("not-absolute", "Devin CLI 路径必须是绝对路径");
  }

  const path = resolve(normalize(executablePath));
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) {
      throw new DevinBinaryError("not-executable", "Devin CLI 路径不是文件");
    }
    if (process.platform !== "win32") {
      await access(path, constants.X_OK);
    }
  } catch (error) {
    if (error instanceof DevinBinaryError) throw error;
    throw new DevinBinaryError("not-executable", "Devin CLI 文件不存在或不可执行");
  }

  const env = sanitizeChildEnv(options.env ?? process.env);
  const rawVersion = options.runVersion
    ? await options.runVersion(path, { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, env })
    : await runVersion(path, { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, env });
  const version = parseDevinVersion(rawVersion);
  if (!version) {
    throw new DevinBinaryError("version", "Devin CLI 未返回可识别的版本号");
  }

  if (options.minVersion && compareVersions(version, options.minVersion) < 0) {
    throw new DevinBinaryError(
      "incompatible",
      `Devin CLI 版本 ${version} 低于最低支持版本 ${options.minVersion}`,
    );
  }

  return { path, version, rawVersion: redactProcessText(rawVersion) };
}

export function parseDevinVersion(output: string): string | undefined {
  // Current CLI prints `Devin CLI x.y.z (...)`; accepting a leading `v`
  // keeps this compatible with package-manager wrappers.
  const match = output.match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)\b/);
  return match?.[1];
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/, "").split(/[+-]/, 1)[0].split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

interface Candidate {
  path: string;
  source: DevinBinarySource;
}

export function collectCandidates(options: {
  configuredPath?: string;
  pathValue?: string;
  platform: NodeJS.Platform;
  homeDirectory: string;
}): Candidate[] {
  const result: Candidate[] = [];
  const seen = new Set<string>();
  const add = (path: string | undefined, source: DevinBinarySource) => {
    if (!path) return;
    const normalized = isAbsolute(path) ? resolve(path) : path;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ path: normalized, source });
  };

  add(options.configuredPath, "configured");

  const executable = options.platform === "win32" ? "devin.exe" : "devin";
  for (const directory of (options.pathValue ?? "").split(delimiter).filter(Boolean)) {
    add(join(directory, executable), "path");
  }

  for (const path of commonDevinPaths(options.platform, options.homeDirectory)) {
    add(path, "common");
  }
  return result;
}

export function commonDevinPaths(platform: NodeJS.Platform, homeDirectory: string): string[] {
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? join(homeDirectory, "AppData", "Local");
    const userProfile = process.env.USERPROFILE ?? homeDirectory;
    return [
      join(localAppData, "Programs", "Devin", "devin.exe"),
      join(localAppData, "Devin", "devin.exe"),
      join(userProfile, ".local", "bin", "devin.exe"),
      join(userProfile, "bin", "devin.exe"),
    ];
  }
  const paths = [join(homeDirectory, ".local", "bin", "devin"), join(homeDirectory, ".devin", "bin", "devin")];
  if (platform === "darwin") {
    paths.push("/opt/homebrew/bin/devin", "/usr/local/bin/devin", "/usr/bin/devin");
  } else {
    paths.push("/usr/local/bin/devin", "/usr/bin/devin");
  }
  return paths;
}

async function runVersion(
  path: string,
  options: { timeoutMs: number; env: NodeJS.ProcessEnv },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(path, ["--version"], {
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new DevinBinaryError("version", "Devin CLI 版本检测超时"));
    }, options.timeoutMs);
    const append = (chunk: Buffer | string) => {
      if (output.length >= 16_384) return;
      output += chunk.toString().slice(0, 16_384 - output.length);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DevinBinaryError("version", `无法执行 Devin CLI：${error.message}`));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new DevinBinaryError("version", "Devin CLI 版本检测失败"));
      } else {
        resolvePromise(output);
      }
    });
  });
}

/** Do not pass through credential-like variables to child diagnostics. */
export function sanitizeChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) safe[key] = value;
  }
  // This function is only a defensive copy for child-process options. It must
  // preserve WINDSURF_API_KEY (or another explicitly supplied credential) so
  // Devin can authenticate; callers must use redactProcessText for logs.
  return safe;
}

function redactProcessText(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").replace(/\b(?:token|secret|password|api[_-]?key)=\S+/gi, "$&".replace(/=.*/, "=[REDACTED]"));
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof DevinBinaryError) return error.message;
  if (error instanceof Error) return error.message.replace(/\s+/g, " ").slice(0, 256);
  return "候选路径不可用";
}
