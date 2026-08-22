import { access } from "node:fs/promises";
import path from "node:path";

const releaseDir = path.resolve("release");
const candidates = process.platform === "darwin"
  ? [
      path.join(releaseDir, "mac-arm64", "Devin Agent.app", "Contents", "MacOS", "Devin Agent"),
      path.join(releaseDir, "mac-x64", "Devin Agent.app", "Contents", "MacOS", "Devin Agent"),
      path.join(releaseDir, "mac", "Devin Agent.app", "Contents", "MacOS", "Devin Agent"),
    ]
  : process.platform === "win32"
    ? [path.join(releaseDir, "win-unpacked", "Devin Agent.exe")]
    : [path.join(releaseDir, "linux-unpacked", "devin-agent")];

for (const candidate of candidates) {
  try {
    await access(candidate);
    console.log(`Packaged executable found: ${candidate}`);
    process.exit(0);
  } catch {
    // Try the next platform-specific candidate.
  }
}
throw new Error(`No packaged Devin Agent executable found under ${releaseDir}`);
