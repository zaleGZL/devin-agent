import { describe, expect, it } from "vitest";
import { normalizeAcpUpdate } from "./acp-normalizer";
import { createConversationState, reduceConversation } from "./conversation";

describe("ACP update normalizer", () => {
  it("maps streamed text/thought chunks and preserves their session", () => {
    expect(normalizeAcpUpdate({ sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } } })).toMatchObject({
      type: "message_chunk", sessionId: "s-1", role: "assistant", text: "hello",
    });
    expect(normalizeAcpUpdate({ sessionId: "s-1", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "inspect" } } })).toMatchObject({
      type: "thought_chunk", sessionId: "s-1", text: "inspect",
    });
  });

  it("maps tool lifecycle, structured plans, commands and mode updates", () => {
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", kind: "read", status: "in_progress", rawInput: { path: "README.md" } } })).toMatchObject({ type: "tool_start", toolId: "t1", args: { path: "README.md" } });
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", rawOutput: "ok" } })).toMatchObject({ type: "tool_end", toolId: "t1", output: "ok", status: "complete" });
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "plan", entries: [{ content: "Implement", status: "in_progress" }] } })).toMatchObject({ type: "plan", plan: { steps: [{ step: "Implement", status: "in_progress" }] } });
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "available_commands_update", availableCommands: [{ name: "/handoff", description: "Cloud" }] } })).toMatchObject({ type: "commands", commands: [{ name: "/handoff" }] });
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "current_mode_update", currentModeId: "smart" } })).toMatchObject({ type: "mode", modeId: "smart" });
    expect(normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "config_option_update", id: "model", currentValue: "vision", options: [{ value: "vision", _meta: { "cognition.ai/supportsImages": true } }] } })).toMatchObject({ type: "config", option: { id: "model", options: [{ value: "vision", supportsImages: true }] } });
    expect(normalizeAcpUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          { id: "mode", name: "Mode", type: "select", currentValue: "smart", options: [{ value: "smart", name: "Smart" }] },
          { id: "model", name: "Model", category: "model", type: "select", currentValue: "vision", options: [{ value: "vision", name: "Vision", _meta: { "cognition.ai/supportsImages": true } }] },
        ],
      },
    })).toMatchObject({
      type: "config_options",
      options: [
        { id: "mode", currentValue: "smart" },
        { id: "model", currentValue: "vision", options: [{ value: "vision", supportsImages: true }] },
      ],
    });
  });

  it("redacts credentials in unknown events and does not stop known events", () => {
    const unknown = normalizeAcpUpdate({ sessionId: "s", updateId: "u1", update: { sessionUpdate: "future_update", apiKey: "secret", nested: { password: "pw", value: "kept" } } });
    expect(unknown).toMatchObject({ type: "unknown", sessionId: "s", updateId: "u1" });
    if (unknown.type !== "unknown") throw new Error("expected unknown");
    expect(unknown.raw).toMatchObject({ apiKey: "[redacted]", nested: { password: "[redacted]", value: "kept" } });

    let state = reduceConversation(createConversationState("s"), unknown);
    state = reduceConversation(state, normalizeAcpUpdate({ sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "still works" }, phase: "end" } }));
    expect(state.unknownEvents).toHaveLength(1);
    expect(state.messages[0]?.text).toBe("still works");
  });

  it("replaces the complete config option set from the ACP v1 batch update", () => {
    let state = createConversationState("s");
    state = reduceConversation(state, { type: "config", sessionId: "s", option: { id: "legacy", currentValue: true } });
    state = reduceConversation(state, normalizeAcpUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          { id: "mode", name: "Mode", type: "select", currentValue: "smart", options: [{ value: "smart", name: "Smart" }] },
          { id: "model", name: "Model", type: "select", currentValue: "adaptive", options: [{ value: "adaptive", name: "Adaptive" }] },
        ],
      },
    }));

    expect(Object.keys(state.configOptions)).toEqual(["mode", "model"]);
    expect(state.configOptions.model?.currentValue).toBe("adaptive");
  });
});
