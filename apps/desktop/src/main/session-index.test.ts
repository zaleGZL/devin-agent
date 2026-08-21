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
