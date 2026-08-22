import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const forbidden = [
  /@thinkany\/dscode-/i,
  /(?:^|[\\/])dscode(?:[\\/]|$)/i,
  /DSCODE_[A-Z_]+/,
  /workspace:[^\n]*dscode/i,
];
const ignoredDirectories = new Set([".git", "node_modules", "release", "coverage", "docs", "openspec"]);
const textExtensions = new Set([".json", ".yaml", ".yml", ".toml", ".ts", ".tsx", ".mjs", ".cjs", ".js", ".css", ".html", ".md", ".map"]);
const violations = [];

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      violations.push(`${relative(absolute)}: symlink is not allowed in build input`);
      continue;
    }
    if (
      entry.name === "AGENTS.md"
      || entry.name === "check-independence.mjs"
      || entry.name.toLowerCase() === "readme.md"
      || entry.name === "THIRD_PARTY_NOTICES.md"
    ) continue;
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = await readFile(absolute, "utf8").catch(() => "");
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        violations.push(`${relative(absolute)}: forbidden DSCode reference (${pattern})`);
        break;
      }
    }
  }
}

function relative(file) { return path.relative(root, file) || "."; }

await walk(root);

if (violations.length > 0) {
  console.error("独立性扫描失败：检测到禁止的 DSCode 技术依赖");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("独立性扫描通过：未发现 DSCode checkout、路径、runtime package 或 symlink 依赖。");
}
