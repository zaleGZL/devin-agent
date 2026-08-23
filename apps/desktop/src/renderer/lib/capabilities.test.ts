import { describe, expect, it } from "vitest";
import { buildPromptContent, imageAttachmentGate, visibleCommands } from "./capabilities";
import { getFeatureGate, normalizeDevinCapabilities, supportsImagePrompt } from "../../shared/capabilities";

describe("Devin capability helpers", () => {
  const capabilities = normalizeDevinCapabilities({
    agentCapabilities: {
      promptCapabilities: { image: true, audio: false },
      sessionCapabilities: { list: {}, delete: {}, additionalDirectories: {} },
      _meta: { subagents: true },
    },
    configOptions: [
      { id: "model", options: [{ value: "vision", name: "Vision", _meta: { "cognition.ai/supportsImages": true } }] },
      { id: "mode", options: [{ value: "smart", name: "Smart" }] },
    ],
    availableCommands: [{ name: "/handoff", description: "cloud" }, { name: "/help" }],
  });

  it("uses runtime models and prompt capability for image gating", () => {
    expect(capabilities.models[0]).toMatchObject({ id: "vision" });
    expect(supportsImagePrompt(capabilities, capabilities.models[0])).toBe(true);
    expect(imageAttachmentGate(capabilities, "vision")).toEqual({ enabled: true });
    expect(buildPromptContent("describe", [{ data: "abc", mimeType: "image/png" }], capabilities, "vision")).toMatchObject({ content: [{ type: "text" }, { type: "image", mimeType: "image/png" }], rejectedImages: 0 });
  });

  it("only exposes advertised commands and gates cloud handoff", () => {
    expect(visibleCommands(capabilities.commands, "hand")).toEqual([
      expect.objectContaining({ name: "/handoff", description: "cloud" }),
    ]);
    expect(getFeatureGate(capabilities, "handoff-cloud")).toMatchObject({ enabled: true, cloud: true });
    expect(getFeatureGate(capabilities, "checkpoint")).toMatchObject({ enabled: false, source: "unsupported" });
  });

  it("gates vendor features on exact per-connection metadata and dynamic commands", () => {
    const advertised = normalizeDevinCapabilities({
      agentCapabilities: {
        _meta: {
          "cognition.ai/editableCommands": true,
          "cognition.ai/commandRevision": true,
          "cognition.ai/chains": true,
          "cognition.ai/sessionRename": true,
        },
      },
      availableCommands: [{ name: "btw" }],
    });
    expect(getFeatureGate(advertised, "editable-commands")).toMatchObject({ enabled: true });
    expect(getFeatureGate(advertised, "command-revision")).toMatchObject({ enabled: true });
    expect(getFeatureGate(advertised, "chain-sidechat")).toMatchObject({ enabled: true });
    expect(getFeatureGate(advertised, "session-rename")).toMatchObject({ enabled: true });

    const refreshed = normalizeDevinCapabilities({ agentCapabilities: { _meta: {} }, availableCommands: [{ name: "btw" }] });
    expect(getFeatureGate(refreshed, "editable-commands")).toMatchObject({ enabled: false });
    expect(getFeatureGate(refreshed, "chain-sidechat")).toMatchObject({ enabled: false });
    expect(getFeatureGate(refreshed, "session-rename")).toMatchObject({ enabled: false });
  });
});
