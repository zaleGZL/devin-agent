import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_EMBEDDED_FILE_BYTES, resolveWorkspaceMention, serializeMentionPrompt } from "./mention-prompt";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => fsp.rm(directory, { recursive: true, force: true }))));

async function fixture(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "devin-prompt-"));
  temporaryDirectories.push(root);
  await fsp.mkdir(path.join(root, "docs"));
  await fsp.writeFile(path.join(root, "docs", "small.md"), "hello");
  await fsp.writeFile(path.join(root, "binary.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
  await fsp.writeFile(path.join(root, "large.txt"), Buffer.alloc(MAX_EMBEDDED_FILE_BYTES + 1, 65));
  return root;
}

const skill = { id: "skill:agents:research", kind: "skill" as const, label: "research", command: "agents:research" };

describe("mention prompt serialization", () => {
  it("embeds small UTF-8 files and prepends one verified Skill", async () => {
    const root = await fixture();
    const result = await serializeMentionPrompt({
      workspaceRoot: root,
      text: "investigate",
      embeddedContext: true,
      availableSkills: [skill],
      mentions: [
        { id: "skill", kind: "skill", label: "research", command: "agents:research" },
        { id: "file", kind: "file", label: "small.md", path: "docs/small.md" },
      ],
    });
    expect(result.text).toBe("@skills:agents:research\ninvestigate");
    expect(result.content).toEqual([
      { type: "text", text: "@skills:agents:research\ninvestigate" },
      expect.objectContaining({ type: "resource", resource: expect.objectContaining({ text: "hello" }) }),
    ]);
  });

  it("uses links when embedding is unavailable, binary or oversized and never expands directories", async () => {
    const root = await fixture();
    const result = await serializeMentionPrompt({
      workspaceRoot: root,
      text: "review",
      embeddedContext: true,
      availableSkills: [],
      mentions: [
        { id: "directory", kind: "directory", label: "docs", path: "docs" },
        { id: "binary", kind: "file", label: "binary.bin", path: "binary.bin" },
        { id: "large", kind: "file", label: "large.txt", path: "large.txt" },
      ],
    });
    expect(result.content.slice(1)).toEqual([
      expect.objectContaining({ type: "resource_link", name: "@docs/" }),
      expect.objectContaining({ type: "resource_link", name: "@binary.bin" }),
      expect.objectContaining({ type: "resource_link", name: "@large.txt" }),
    ]);

    const capabilityFallback = await serializeMentionPrompt({
      workspaceRoot: root,
      text: "review",
      embeddedContext: false,
      availableSkills: [],
      mentions: [{ id: "small", kind: "file", label: "small.md", path: "docs/small.md" }],
    });
    expect(capabilityFallback.content[1]).toEqual(expect.objectContaining({ type: "resource_link", name: "@docs/small.md" }));
  });

  it("supports a mention-only prompt without adding an empty text block", async () => {
    const root = await fixture();
    const result = await serializeMentionPrompt({
      workspaceRoot: root,
      text: "",
      embeddedContext: false,
      availableSkills: [],
      mentions: [{ id: "small", kind: "file", label: "small.md", path: "docs/small.md" }],
    });
    expect(result.content).toEqual([
      expect.objectContaining({ type: "resource_link", name: "@docs/small.md" }),
    ]);
  });

  it("rejects traversal, escaping symlinks, changed kinds and stale Skills", async () => {
    const root = await fixture();
    const outside = await fsp.mkdtemp(path.join(os.tmpdir(), "devin-outside-"));
    temporaryDirectories.push(outside);
    await fsp.writeFile(path.join(outside, "secret"), "secret");
    await fsp.symlink(path.join(outside, "secret"), path.join(root, "escape"));
    await expect(resolveWorkspaceMention(root, "../secret", "file")).rejects.toThrow(/outside/);
    await expect(resolveWorkspaceMention(root, "escape", "file")).rejects.toThrow(/outside/);
    await expect(resolveWorkspaceMention(root, "docs", "file")).rejects.toThrow(/regular file/);
    await expect(resolveWorkspaceMention(root, "missing.md", "file")).rejects.toThrow(/no longer exists/);
    await expect(serializeMentionPrompt({ workspaceRoot: root, text: "x", embeddedContext: true, availableSkills: [], mentions: [
      { id: "skill", kind: "skill", label: "research", command: "agents:research" },
    ] })).rejects.toThrow(/session snapshot/);
  });
});
