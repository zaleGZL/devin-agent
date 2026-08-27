import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TelegramStore } from "./store";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function createStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-telegram-store-"));
  temporary.push(root);
  return new TelegramStore(root);
}

describe("TelegramStore", () => {
  it("keeps one fixed bot state and deduplicates inbound messages", async () => {
    const store = await createStore();
    store.patchState({ workspacePath: "/workspace", sessionId: "fixed", botId: 42, chatId: 123 });
    const first = store.addMessage({
      platformId: "tg-1",
      direction: "inbound",
      source: "telegram",
      role: "user",
      text: "hello",
      media: [],
      status: "processing",
    });
    const duplicate = store.addMessage({
      platformId: "tg-1",
      direction: "inbound",
      source: "telegram",
      role: "user",
      text: "duplicate",
      media: [],
      status: "processing",
    });
    expect(duplicate.id).toBe(first.id);
    expect(store.getState()).toMatchObject({ workspacePath: "/workspace", sessionId: "fixed", botId: 42, chatId: 123 });
    expect(store.history()).toMatchObject({ messages: [{ text: "hello" }], hasMore: false });
    store.close();
  });

  it("persists inbox and outbox work until completion", async () => {
    const store = await createStore();
    expect(store.persistInbox("tg-1", { update_id: 1 })).toBe(true);
    expect(store.persistInbox("tg-1", { update_id: 1 })).toBe(false);
    expect(store.pendingInbox()).toHaveLength(1);
    store.completeInbox("tg-1");
    expect(store.pendingInbox()).toHaveLength(0);
    store.enqueueOutbox("client-1", { kind: "text", chatId: 123, text: "reply" });
    store.failOutbox("client-1", "network");
    expect(store.pendingOutbox()).toMatchObject([{ clientId: "client-1", payload: { text: "reply" } }]);
    store.completeOutbox("client-1");
    expect(store.pendingOutbox()).toHaveLength(0);
    store.close();
  });

  it("removes durable media only on explicit clear", async () => {
    const store = await createStore();
    const file = await store.saveMedia(Buffer.from("media"), "a.txt", "inbound");
    expect(store.mediaBytes()).toBe(5);
    await store.clearAll();
    expect(store.mediaBytes()).toBe(0);
    await expect(fs.access(file)).rejects.toThrow();
    store.close();
  });

  it("advances updates offset independently of messages", async () => {
    const store = await createStore();
    store.patchState({ updatesOffset: 100 });
    expect(store.getState().updatesOffset).toBe(100);
    store.patchState({ updatesOffset: 105 });
    expect(store.getState().updatesOffset).toBe(105);
    store.close();
  });
});
