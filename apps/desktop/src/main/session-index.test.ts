import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveSession,
  configureSessionIndex,
  listSessions,
  mergeSessionSummary,
  readSessionSummary,
  renameSession,
  reorderSessions,
  setSessionPinned,
  unarchiveSession,
  upsertSessionSummary,
} from "./session-index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("session index", () => {
  it("extracts workspace, model, title, and message count from JSONL", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-desktop-test-"));
    temporaryDirectories.push(directory);
    const file = path.join(directory, "session.jsonl");
    await fs.writeFile(file, [
      JSON.stringify({ type: "session", version: 3, id: "session-1", cwd: "/tmp/project" }),
      JSON.stringify({ type: "model_change", modelId: "devin-default" }),
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "Implement a polished desktop client" }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "I will inspect the core package." }] } }),
    ].join("\n"));

    await expect(readSessionSummary(file)).resolves.toMatchObject({
      id: "session-1",
      cwd: path.resolve("/tmp/project"),
      model: "devin-default",
      title: "Implement a polished desktop client",
      messageCount: 2,
    });
  });

  it("keeps archive state as a reversible local overlay", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-session-index-"));
    temporaryDirectories.push(directory);
    configureSessionIndex(path.join(directory, "sessions.json"));
    const now = new Date().toISOString();
    await upsertSessionSummary({ id: "session-1", path: "session-1", cwd: "/tmp/project", title: "Background task", createdAt: now, updatedAt: now });

    await expect(archiveSession("session-1")).resolves.toMatchObject({ archived: true });
    await expect(listSessions()).resolves.toEqual([expect.objectContaining({ id: "session-1", archived: true })]);
    await expect(unarchiveSession("session-1")).resolves.toMatchObject({ archived: false });
    await expect(listSessions()).resolves.toEqual([expect.objectContaining({ id: "session-1", archived: false })]);
  });

  it("persists custom titles and sorts pinned sessions first", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-session-index-"));
    temporaryDirectories.push(directory);
    configureSessionIndex(path.join(directory, "sessions.json"));
    await upsertSessionSummary({ id: "older", path: "older", cwd: "/tmp/project", title: "Older", createdAt: "2026-08-21T09:00:00Z", updatedAt: "2026-08-21T09:00:00Z" });
    await upsertSessionSummary({ id: "newer", path: "newer", cwd: "/tmp/project", title: "Newer", createdAt: "2026-08-21T10:00:00Z", updatedAt: "2026-08-21T10:00:00Z" });

    await expect(renameSession("older", "  Release checklist  ")).resolves.toMatchObject({ title: "Release checklist", customTitle: "Release checklist" });
    await expect(setSessionPinned("older", true)).resolves.toBe(true);
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "older", title: "Release checklist", pinned: true }),
      expect.objectContaining({ id: "newer" }),
    ]);

    await upsertSessionSummary({ id: "older", path: "older", cwd: "/tmp/project", title: "Remote title", createdAt: "2026-08-21T09:00:00Z", updatedAt: "2026-08-21T11:00:00Z" });
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "older", title: "Release checklist", customTitle: "Release checklist" }),
      expect.objectContaining({ id: "newer" }),
    ]);
  });

  it("persists a custom sidebar order across later ACP summary updates", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-session-index-"));
    temporaryDirectories.push(directory);
    configureSessionIndex(path.join(directory, "sessions.json"));
    await upsertSessionSummary({ id: "first", path: "first", cwd: "/tmp/project", title: "First", createdAt: "2026-08-21T09:00:00Z", updatedAt: "2026-08-21T09:00:00Z" });
    await upsertSessionSummary({ id: "second", path: "second", cwd: "/tmp/project", title: "Second", createdAt: "2026-08-21T10:00:00Z", updatedAt: "2026-08-21T10:00:00Z" });

    await expect(reorderSessions(["first", "second"])).resolves.toBe(true);
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "first", sidebarOrder: 0 }),
      expect.objectContaining({ id: "second", sidebarOrder: 1 }),
    ]);

    await upsertSessionSummary({ id: "second", path: "second", cwd: "/tmp/project", title: "Updated second", createdAt: "2026-08-21T10:00:00Z", updatedAt: "2026-08-21T12:00:00Z" });
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "first", sidebarOrder: 0 }),
      expect.objectContaining({ id: "second", sidebarOrder: 1, title: "Updated second" }),
    ]);
  });

  it("keeps project membership and optimistic conversation metadata when ACP returns a partial summary", () => {
    const local = {
      id: "session-1",
      path: "session-1",
      cwd: "/tmp/project",
      title: "Introduce this project",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:03.000Z",
      messageCount: 1,
      preview: "Introduce this project",
    };

    expect(mergeSessionSummary(local, {
      id: "session-1",
      path: "session-1",
      cwd: "",
      title: "session-1",
      createdAt: "2026-08-21T10:00:01.000Z",
      updatedAt: "2026-08-21T10:00:01.000Z",
      provider: "devin",
    })).toMatchObject({
      cwd: "/tmp/project",
      title: "Introduce this project",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:03.000Z",
      messageCount: 1,
      preview: "Introduce this project",
    });
  });
});
