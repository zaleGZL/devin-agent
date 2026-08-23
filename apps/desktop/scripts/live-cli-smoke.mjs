import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.DEVIN_LIVE_TEST !== "1") {
  throw new Error("Set DEVIN_LIVE_TEST=1 to acknowledge that this smoke test sends minimal prompts through your authenticated Devin CLI.");
}

const buildDirectory = path.resolve("dist-electron");
const hostModuleName = (await readdir(buildDirectory)).find((name) => /^devin-acp-host-[A-Z0-9]+\.mjs$/.test(name));
if (!hostModuleName) throw new Error("Build the Desktop app before running the live Devin smoke test.");
const { DevinAcpHost } = await import(pathToFileURL(path.join(buildDirectory, hostModuleName)).href);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cwd = await mkdtemp(path.join(path.dirname(repositoryRoot), "devin-agent-live-"));
const updateKinds = new Set();
const availableCommands = new Set();
let permissionRequests = 0;
let elicitationRequests = 0;
const promptResults = [];
const mentionResults = [];
let createdSession;
let firstHost;
let recoveryHost;

const options = {
  cwd,
  ...(process.env.DEVIN_CLI_PATH ? { binaryPath: process.env.DEVIN_CLI_PATH } : {}),
  onUpdate: (event) => {
    updateKinds.add(event.update?.sessionUpdate ?? event.update?.type ?? "unknown");
    if (event.update?.sessionUpdate === "available_commands_update" && Array.isArray(event.update.availableCommands)) {
      for (const command of event.update.availableCommands) {
        const name = typeof command === "string" ? command : command?.name;
        if (typeof name === "string") availableCommands.add(name.replace(/^\//, "").toLowerCase());
      }
    }
  },
  onPermissionRequest: () => {
    permissionRequests += 1;
    return null;
  },
  onElicitationRequest: () => {
    elicitationRequests += 1;
    return { action: "cancel" };
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

  if (!firstHost.hasExtension("cognition.ai/chains") || !availableCommands.has("btw")) {
    throw new Error("The live Devin session did not jointly advertise chains and /btw.");
  }
  const sideChatResult = await firstHost.sideChat("Reply with OK only. Do not run tools or modify files. This verifies the side chain.");
  promptResults.push(`side:${sideChatResult.stopReason ?? "unknown"}`);

  const imageResult = await firstHost.prompt([
    { type: "text", text: "Reply with OK only. Do not run tools or modify files. This is a Desktop ACP smoke test." },
    { type: "image", mimeType: "image/png", data: imageData },
  ]);
  promptResults.push(imageResult.stopReason ?? "unknown");

  if (!firstHost.hasExtension("cognition.ai/sessionRename")) throw new Error("The live Devin session did not advertise native rename.");
  const smokeTitle = `Desktop ACP smoke ${Date.now()}`;
  await firstHost.renameSession(createdSession.sessionId, smokeTitle);
  const renamed = (await firstHost.listSessions({ cwd })).sessions.some((session) => session.sessionId === createdSession.sessionId && session.title === smokeTitle);
  if (!renamed) throw new Error("Native session rename was not visible in session/list.");

  const mentionDirectory = path.join(cwd, "docs");
  const mentionFile = path.join(mentionDirectory, "context.txt");
  await mkdir(mentionDirectory, { recursive: true });
  await writeFile(mentionFile, "DEVIN_AGENT_MENTION_SMOKE\n", "utf8");
  const fileUri = pathToFileURL(mentionFile).href;
  const directoryUri = pathToFileURL(mentionDirectory).href;
  const embeddedResult = await firstHost.prompt([
    { type: "text", text: "Reply with OK only. Do not run tools or modify files. This prompt verifies an embedded local resource." },
    { type: "resource", resource: { uri: fileUri, mimeType: "text/plain", text: "DEVIN_AGENT_MENTION_SMOKE\n" } },
  ]);
  mentionResults.push({ kind: "embedded-file", stopReason: embeddedResult.stopReason ?? "unknown" });
  const linkedFileResult = await firstHost.prompt([
    { type: "text", text: "Reply with OK only. Do not run tools or modify files. This prompt verifies a local file ResourceLink." },
    { type: "resource_link", uri: fileUri, name: "@docs/context.txt", mimeType: "text/plain" },
  ]);
  mentionResults.push({ kind: "linked-file", stopReason: linkedFileResult.stopReason ?? "unknown" });
  const linkedDirectoryResult = await firstHost.prompt([
    { type: "text", text: "Reply with OK only. Do not run tools or modify files. This prompt verifies a non-recursive directory ResourceLink." },
    { type: "resource_link", uri: directoryUri, name: "@docs/", description: "Workspace directory (not recursively embedded)" },
  ]);
  mentionResults.push({ kind: "linked-directory", stopReason: linkedDirectoryResult.stopReason ?? "unknown" });

  const permissionMode = availableModes.find((mode) => mode && typeof mode === "object" && mode.id === "accept-edits");
  if (permissionMode) {
    await firstHost.setMode("accept-edits");
    const permissionResult = await firstHost.prompt("Use the shell to run `pwd | shasum -a 256` exactly once and report only the hash. The random workspace path is not shown in this prompt, so do not infer it. Do not modify files.");
    promptResults.push(permissionResult.stopReason ?? "unknown");
  }

  await firstHost.prompt("Use ask_user_question to ask whether this ACP smoke test should continue. Do not run tools or modify files.").catch(() => undefined);
  if (elicitationRequests === 0) throw new Error("The live Devin session did not route ask_user_question through elicitation/create.");

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
    elicitationRequests,
    chainsAdvertised: availableCommands.has("btw"),
    nativeRename: true,
    mentionResults,
    promptResults,
    recovered,
    updateKinds: [...updateKinds].sort(),
  }));
} finally {
  if (createdSession && recoveryHost) await recoveryHost.deleteSession(createdSession.sessionId, createdSession).catch(() => undefined);
  if (createdSession && firstHost) await firstHost.deleteSession(createdSession.sessionId, createdSession).catch(() => undefined);
  if (firstHost) await firstHost.stop().catch(() => undefined);
  if (recoveryHost) await recoveryHost.stop().catch(() => undefined);
  await rm(cwd, { recursive: true, force: true });
}
