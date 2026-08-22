#!/usr/bin/env node
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const executeFile = promisify(execFile);
const minimumNodeVersion = [22, 19, 0];
const scriptFile = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const desktopDirectory = path.join(repositoryRoot, "apps", "desktop");
const downloadsDirectory = path.join(os.homedir(), "Downloads");

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

function parseNodeVersion(value) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : undefined;
}

function supportsBuild(version) {
  if (!version) return false;
  for (let index = 0; index < minimumNodeVersion.length; index += 1) {
    if (version[index] !== minimumNodeVersion[index]) return version[index] > minimumNodeVersion[index];
  }
  return true;
}

async function findCompatibleNode() {
  const candidates = new Set([
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ]);
  const nvmVersionsDirectory = path.join(os.homedir(), ".nvm", "versions", "node");
  const nvmVersions = await readdir(nvmVersionsDirectory).catch(() => []);
  for (const version of nvmVersions) candidates.add(path.join(nvmVersionsDirectory, version, "bin", "node"));

  const compatible = [];
  for (const candidate of candidates) {
    try {
      const { stdout } = await executeFile(candidate, ["--version"]);
      const version = parseNodeVersion(stdout);
      if (supportsBuild(version)) compatible.push({ candidate, version });
    } catch {
      // Try the next conventional Node installation.
    }
  }
  compatible.sort((left, right) => {
    const leftPreferred = left.version[0] === minimumNodeVersion[0] ? 1 : 0;
    const rightPreferred = right.version[0] === minimumNodeVersion[0] ? 1 : 0;
    if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
    for (let index = 0; index < left.version.length; index += 1) {
      if (left.version[index] !== right.version[index]) return right.version[index] - left.version[index];
    }
    return 0;
  });
  return compatible[0]?.candidate;
}

async function findOnPath(executable) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, executable);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next PATH entry.
    }
  }
  return undefined;
}

const pnpmExecutable = process.env.PACK_MAC_PNPM ?? await findOnPath("pnpm") ?? "pnpm";

if (!supportsBuild(parseNodeVersion(process.version))) {
  const compatibleNode = await findCompatibleNode();
  if (!compatibleNode) throw new Error(`pack:mac requires Node >=${minimumNodeVersion.join(".")}`);
  const compatibleBin = path.dirname(compatibleNode);
  console.log(`Switching from ${process.version} to ${compatibleNode}`);
  await run(compatibleNode, [scriptFile], {
    env: {
      ...process.env,
      PATH: `${compatibleBin}:${process.env.PATH ?? ""}`,
      PACK_MAC_PNPM: pnpmExecutable,
    },
  });
  process.exit(0);
}

if (process.platform !== "darwin") {
  throw new Error("pack:mac must be run on macOS");
}

const desktopPackage = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
const artifactName = `${desktopPackage.productName}_${desktopPackage.version}_arm64.dmg`;
const builtArtifact = path.join(desktopDirectory, "release", artifactName);
const downloadedArtifact = path.join(downloadsDirectory, artifactName);
const runtimeBin = await mkdtemp(path.join(os.tmpdir(), "devin-agent-pack-"));
await symlink(process.execPath, path.join(runtimeBin, "node"));
await symlink(pnpmExecutable, path.join(runtimeBin, "pnpm"));
const buildEnvironment = {
  ...process.env,
  PATH: `${runtimeBin}:${process.env.PATH ?? ""}`,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

try {
  await run(pnpmExecutable, ["--dir", "apps/desktop", "build"], { env: buildEnvironment });
  await run(
    pnpmExecutable,
    [
      "--dir",
      "apps/desktop",
      "exec",
      "electron-builder",
      "--mac",
      "dmg",
      "--arm64",
      "--config.mac.notarize=false",
    ],
    { env: buildEnvironment },
  );

  await access(builtArtifact);
  await mkdir(downloadsDirectory, { recursive: true });
  await copyFile(builtArtifact, downloadedArtifact);
  console.log(`DMG copied to ${downloadedArtifact}`);

  await run("/usr/bin/open", [downloadsDirectory]);
} finally {
  await rm(runtimeBin, { recursive: true, force: true });
}
