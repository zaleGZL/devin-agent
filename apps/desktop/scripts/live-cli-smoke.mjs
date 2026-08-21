import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.DEVIN_LIVE_TEST !== "1") {
  throw new Error("Set DEVIN_LIVE_TEST=1 to acknowledge that this smoke test sends minimal prompts through your authenticated Devin CLI.");
}

const buildDirectory = path.resolve("dist-electron");
const hostModuleName = (await readdir(buildDirectory)).find((name) => /^devin-acp-host-[A-Z0-9]+\.mjs$/.test(name));
if (!hostModuleName) throw new Error("Build the Desktop app before running the live Devin smoke test.");
const { DevinAcpHost } = await import(pathToFileURL(path.join(buildDirectory, hostModuleName)).href);
const cwd = await mkdtemp(path.join(os.tmpdir(), "devin-agent-live-"));
const updateKinds = new Set();
let permissionRequests = 0;
const promptResults = [];
let createdSession;
let firstHost;
let recoveryHost;

const options = {
  cwd,
  ...(process.env.DEVIN_CLI_PATH ? { binaryPath: process.env.DEVIN_CLI_PATH } : {}),
  onUpdate: (event) => updateKinds.add(event.update?.sessionUpdate ?? event.update?.type ?? "unknown"),
  onPermissionRequest: () => {
    permissionRequests += 1;
    return null;
  },
};

try {
  firstHost = new DevinAcpHost(options);
  const capabilities = await firstHost.start();
  createdSession = await firstHost.newSession(cwd);
  const modeState = createdSession.modes && typeof createdSession.modes === "object" ? createdSession.modes : {};
  const currentMode = typeof modeState.currentModeId === "string" ? modeState.currentModeId : undefined;
  const availableModes = Array.isArray(modeState.availableModes) ? modeState.availableModes : [];
  const modelOption = createdSession.configOptions?.find((option) => option.id === "model");
  const currentModel = typeof modelOption?.currentValue === "string" ? modelOption.currentValue : undefined;
  const supportsImages = (option) => option?._meta?.["cognition.ai/supportsImages"] === true;
  const imageModelOption = modelOption?.options?.find((option) => option?.value === "adaptive" && supportsImages(option))
    ?? modelOption?.options?.find((option) => option?.value === currentModel && supportsImages(option))
    ?? modelOption?.options?.find(supportsImages);
  const imageSupported = capabilities.promptCapabilities.image === true
    && typeof imageModelOption?.value === "string";

  if (currentMode) await firstHost.setMode(currentMode);
  if (imageModelOption?.value) await firstHost.setConfigOption("model", imageModelOption.value);
  if (!imageSupported) throw new Error("The current live Devin session/model did not advertise image input.");
  const imageData = (await readFile(path.resolve("build/icon.png"))).toString("base64");

  const imageResult = await firstHost.prompt([
    { type: "text", text: "Reply with OK only. Do not run tools or modify files. This is a Desktop ACP smoke test." },
    { type: "image", mimeType: "image/png", data: imageData },
  ]);
  promptResults.push(imageResult.stopReason ?? "unknown");

  const permissionMode = availableModes.find((mode) => mode && typeof mode === "object" && mode.id === "accept-edits");
  if (permissionMode) {
    await firstHost.setMode("accept-edits");
    const permissionResult = await firstHost.prompt("Use the shell to run `pwd | shasum -a 256` exactly once and report only the hash. The random workspace path is not shown in this prompt, so do not infer it. Do not modify files.");
    promptResults.push(permissionResult.stopReason ?? "unknown");
  }

  const cancellable = firstHost.prompt("Think briefly, then reply with the word CANCEL-SMOKE. Do not use tools or modify files.");
  setTimeout(() => { void firstHost.cancel(); }, 25);
  await cancellable.catch(() => undefined);
  await firstHost.stop();
  firstHost = undefined;

  recoveryHost = new DevinAcpHost(options);
  await recoveryHost.start();
  await recoveryHost.loadSession(createdSession.sessionId, { cwd });
  const recovered = recoveryHost.sessionId === createdSession.sessionId;
  await recoveryHost.deleteSession(createdSession.sessionId, createdSession);
  createdSession = undefined;

  console.log(JSON.stringify({
    protocolVersion: capabilities.protocolVersion,
    imageSupported,
    modeWrite: Boolean(currentMode),
    modelWrite: Boolean(imageModelOption?.value),
    permissionRequests,
    promptResults,
    recovered,
    updateKinds: [...updateKinds].sort(),
  }));
} finally {
  if (createdSession && recoveryHost) await recoveryHost.deleteSession(createdSession.sessionId, createdSession).catch(() => undefined);
  if (createdSession && firstHost) await firstHost.deleteSession(createdSession.sessionId, createdSession).catch(() => undefined);
  if (firstHost) await firstHost.stop().catch(() => undefined);
  if (recoveryHost) await recoveryHost.stop().catch(() => undefined);
}
