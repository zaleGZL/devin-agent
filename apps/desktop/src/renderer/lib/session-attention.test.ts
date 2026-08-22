import { describe, expect, it } from "vitest";
import { clearSessionUnread, markBackgroundSessionUnread } from "./session-attention";

describe("session attention", () => {
  it("marks a completed background session without marking the active session", () => {
    const empty = new Set<string>();
    const background = markBackgroundSessionUnread(empty, "session-a", "session-b");

    expect([...background]).toEqual(["session-a"]);
    expect(markBackgroundSessionUnread(background, "session-b", "session-b")).toBe(background);
  });

  it("clears the unread marker when the session is opened", () => {
    const unread = new Set(["session-a", "session-b"]);

    expect([...clearSessionUnread(unread, "session-a")]).toEqual(["session-b"]);
    expect(clearSessionUnread(unread, "missing")).toBe(unread);
  });
});
