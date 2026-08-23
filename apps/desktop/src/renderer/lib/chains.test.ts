import { describe, expect, it } from "vitest";
import {
  beginChainConversation,
  chainConversationKey,
  clearChainGeneration,
  reduceChainConversation,
  settleChainConversation,
  type ChainConversationStore,
} from "./chains";

describe("chain conversation reducer", () => {
  it("isolates main, side and multiple chain streams", () => {
    let store: ChainConversationStore = {};
    store = beginChainConversation(store, "s", "side-a", "first", 1);
    store = beginChainConversation(store, "s", "side-b", "second", 1);
    const unchanged = reduceChainConversation(store, { type: "message_chunk", sessionId: "s", role: "assistant", text: "main" }, 1);
    expect(unchanged).toBe(store);
    store = reduceChainConversation(store, { type: "message_chunk", sessionId: "s", chainId: "side-a", role: "assistant", text: "answer-a" }, 1);
    store = reduceChainConversation(store, { type: "message_chunk", sessionId: "s", chainId: "side-b", role: "assistant", text: "answer-b" }, 1);
    expect(store[chainConversationKey("s", "side-a")]?.messages.map((message) => message.text)).toEqual(["first", "answer-a"]);
    expect(store[chainConversationKey("s", "side-b")]?.messages.map((message) => message.text)).toEqual(["second", "answer-b"]);
  });

  it("tracks failures, settlement and discards old generations", () => {
    let store = beginChainConversation({}, "s", "side", "question", 1);
    store = settleChainConversation(store, "s", "side", 1, "failed");
    expect(store[chainConversationKey("s", "side")]).toMatchObject({ running: false, error: "failed" });
    store = beginChainConversation(store, "s", "side", "new", 2);
    expect(store[chainConversationKey("s", "side")]?.messages.map((message) => message.text)).toEqual(["new"]);
    expect(clearChainGeneration(store, 1)).toEqual({});
  });
});
