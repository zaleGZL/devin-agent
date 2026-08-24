#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_MAX_LINES = 2_500;
export const FEATURE_MAX_LINES = 600;

export function lineCount(source) {
  if (!source) return 0;
  return source.endsWith("\n") ? source.split("\n").length - 1 : source.split("\n").length;
}

export function inspectAppSource(source, file = "apps/desktop/src/renderer/App.tsx") {
  const violations = [];
  const lines = lineCount(source);
  if (lines > APP_MAX_LINES) {
    violations.push(`${file}: ${lines} lines exceeds the ${APP_MAX_LINES}-line composition-root limit`);
  }

  const componentNames = [];
  const declarationPattern = /^(?:export\s+(?:default\s+)?)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|^(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^\n]*\)|[A-Za-z0-9_]+)\s*=>/gm;
  for (const match of source.matchAll(declarationPattern)) {
    const name = match[1] ?? match[2];
    if (name && name !== "App") componentNames.push(name);
  }
  if (componentNames.length > 0) {
    violations.push(`${file}: move top-level component${componentNames.length > 1 ? "s" : ""} ${componentNames.join(", ")} into renderer/features/<domain>/`);
  }
  return violations;
}

export function inspectFeatureSource(source, file) {
  const lines = lineCount(source);
  return lines > FEATURE_MAX_LINES
    ? [`${file}: ${lines} lines exceeds the ${FEATURE_MAX_LINES}-line feature-module limit; split by business responsibility`]
    : [];
}

async function featureFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await featureFiles(absolute));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

export async function inspectRendererArchitecture(repositoryRoot) {
  const appPath = path.join(repositoryRoot, "apps/desktop/src/renderer/App.tsx");
  const featuresPath = path.join(repositoryRoot, "apps/desktop/src/renderer/features");
  const violations = inspectAppSource(await readFile(appPath, "utf8"), path.relative(repositoryRoot, appPath));
  for (const file of await featureFiles(featuresPath)) {
    violations.push(...inspectFeatureSource(await readFile(file, "utf8"), path.relative(repositoryRoot, file)));
  }
  return violations;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = await inspectRendererArchitecture(repositoryRoot);
  if (violations.length > 0) {
    console.error("Renderer architecture check failed. See docs/development.md#renderer-component-architecture.");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log(`Renderer architecture check passed: App.tsx <= ${APP_MAX_LINES} lines and feature modules <= ${FEATURE_MAX_LINES} lines.`);
  }
}
