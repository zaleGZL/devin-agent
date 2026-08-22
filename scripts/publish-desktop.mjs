#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const desktopPkgPath = path.join(root, "apps", "desktop", "package.json");

function run(cmd, { capture = false } = {}) {
  if (capture) return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function parseVersion(raw) {
  const match = String(raw).match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/);
  if (!match) throw new Error(`package.json version "${raw}" is not a valid semver`);
  return match[1];
}

const desktopPkg = JSON.parse(await readFile(desktopPkgPath, "utf8"));
const version = parseVersion(desktopPkg.version);
const tag = `desktop-v${version}`;

console.log(`apps/desktop/package.json version: ${version}`);
console.log(`release tag: ${tag}`);

// Refuse if the working tree is dirty.
const status = run("git status --porcelain", { capture: true });
if (status) {
  console.error("\nWorking tree is not clean. Commit or stash changes before publishing.");
  console.error(status);
  process.exit(1);
}

// Refuse if the tag already exists locally or on the remote.
const localTags = run("git tag --list", { capture: true }).split("\n");
if (localTags.includes(tag)) {
  console.error(`\nTag "${tag}" already exists locally.`);
  process.exit(1);
}

let remoteTags = "";
try {
  remoteTags = run("git ls-remote --tags origin", { capture: true });
} catch {
  console.error("\nCould not reach remote 'origin'. Check your network and remote configuration.");
  process.exit(1);
}
if (remoteTags.includes(`refs/tags/${tag}`)) {
  console.error(`\nTag "${tag}" already exists on the remote.`);
  process.exit(1);
}

// Ensure HEAD is pushed to the remote so the tag points at a reachable commit.
const branch = run("git rev-parse --abbrev-ref HEAD", { capture: true });
const unpushed = run(`git log origin/${branch}..HEAD --oneline`, { capture: true });
if (unpushed) {
  console.log(`\nPushing ${branch} before tagging...`);
  run(`git push origin ${branch}`);
}

console.log(`\nCreating and pushing tag ${tag}...`);
run(`git tag ${tag}`);
run(`git push origin ${tag}`);

console.log(`\nDone. GitHub Actions will build and publish the Release.`);
console.log(`Track it at: (your repo)/actions`);
