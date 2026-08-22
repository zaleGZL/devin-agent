#!/usr/bin/env node
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const minimumNodeVersion = [22, 19, 0];
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

if (!supportsBuild(parseNodeVersion(process.version))) {
  throw new Error(`pack:mac requires Node >=${minimumNodeVersion.join(".")}; activate a compatible Node version first`);
}

if (process.platform !== "darwin") {
  throw new Error("pack:mac must be run on macOS");
}

const desktopPackage = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
const artifactName = `${desktopPackage.productName}_${desktopPackage.version}_arm64.dmg`;
const builtArtifact = path.join(desktopDirectory, "release", artifactName);
const downloadedArtifact = path.join(downloadsDirectory, artifactName);
const buildEnvironment = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

await run("pnpm", ["--dir", "apps/desktop", "build"], { env: buildEnvironment });
await run(
  "pnpm",
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
