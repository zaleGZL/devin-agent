import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramApi, redactToken } from "./protocol";

afterEach(() => vi.unstubAllGlobals());

describe("TelegramApi", () => {
  it("rejects malformed tokens", () => {
    expect(() => new TelegramApi("invalid", "1.0.0")).toThrow(/格式无效/);
    expect(() => new TelegramApi("123456:AAinvalid", "1.0.0")).toThrow(/格式无效/);
  });

  it("accepts a well-formed token", () => {
    expect(() => new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0")).not.toThrow();
  });

  it("calls getMe and returns bot info", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 42, username: "test_bot", first_name: "Test", can_join_groups: true },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0");
    const me = await api.getMe();
    expect(me).toMatchObject({ id: 42, username: "test_bot" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown[];
    const url = call[0] as string;
    expect(url).toContain("https://api.telegram.org/bot123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/getMe");
  });

  it("getUpdates returns updates and advances offset", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: [
        { update_id: 100, message: { message_id: 1, date: 0, chat: { id: 123, type: "private" }, text: "hello" } },
        { update_id: 101, message: { message_id: 2, date: 0, chat: { id: 123, type: "private" }, text: "world" } },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0");
    const { updates, nextOffset } = await api.getUpdates(0);
    expect(updates).toHaveLength(2);
    expect(nextOffset).toBe(102);
  });

  it("getUpdates returns empty on timeout", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0");
    const { updates, nextOffset } = await api.getUpdates(50);
    expect(updates).toHaveLength(0);
    expect(nextOffset).toBe(50);
  });

  it("sendMessage sends text to chat", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: { message_id: 10, date: 0, chat: { id: 123, type: "private" }, text: "reply" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0");
    const msg = await api.sendMessage(123, "reply");
    expect(msg.message_id).toBe(10);
  });

  it("throws on API error response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      description: "Unauthorized",
      error_code: 401,
    }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new TelegramApi("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "1.0.0");
    await expect(api.sendMessage(123, "hello")).rejects.toThrow(/Unauthorized/);
  });
});

describe("redactToken", () => {
  it("redacts the middle of a token", () => {
    expect(redactToken("123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe("1234…xxxx");
  });
  it("redacts short tokens entirely", () => {
    expect(redactToken("short")).toBe("[redacted]");
  });
});
