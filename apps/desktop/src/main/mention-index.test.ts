import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { collectDirectories, isSensitiveMentionPath, MentionIndex, rankMentionPaths, walkWorkspace } from "./mention-index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fsp.rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "devin-mentions-"));
  temporaryDirectories.push(root);
  await fsp.mkdir(path.join(root, "src", "nested"), { recursive: true });
  await fsp.mkdir(path.join(root, "empty"));
  await fsp.mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  await fsp.writeFile(path.join(root, "README.md"), "read me");
  await fsp.writeFile(path.join(root, "src", "app.ts"), "export {};");
  await fsp.writeFile(path.join(root, "src", "nested", ".env"), "SECRET=1");
  await fsp.writeFile(path.join(root, "node_modules", "ignored", "index.js"), "ignored");
  return root;
}

describe("mention workspace index", () => {
  it("walks a non-Git workspace without caches or symlinks", async () => {
    const root = await fixture();
    await fsp.symlink(path.join(root, "src"), path.join(root, "linked-src"));
    expect(await walkWorkspace(root)).toEqual(["README.md", "src/app.ts", "src/nested/.env"]);
  });

  it("derives directories, ranks fuzzy matches and classifies sensitive files", () => {
    expect(collectDirectories(["src/nested/app.ts", "README.md"])).toEqual(["src", "src/nested"]);
    expect(rankMentionPaths(["docs/readme.md", "src/reader.ts", "README.md"], "read")[0]).toBe("README.md");
    expect(rankMentionPaths(["src/main.ts", "packages/desktop/package.json"], "pack")).toEqual([
      "packages/desktop/package.json",
    ]);
    expect(isSensitiveMentionPath("config/.env.local")).toBe(true);
    expect(isSensitiveMentionPath("src/app.ts")).toBe(false);
  });

  it("returns bounded typed results", async () => {
    const root = await fixture();
    const index = new MentionIndex();
    expect(await index.search(root, "file", "app", 1)).toEqual([
      expect.objectContaining({ kind: "file", path: "src/app.ts" }),
    ]);
    expect(await index.search(root, "directory", "nested")).toEqual([
      expect.objectContaining({ kind: "directory", path: "src/nested" }),
    ]);
    expect(await index.search(root, "directory", "empty")).toEqual([
      expect.objectContaining({ kind: "directory", path: "empty" }),
    ]);
    expect(await index.search(root, "all", "src")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "directory", path: "src" }),
      expect.objectContaining({ kind: "file", path: "src/app.ts" }),
    ]));
  });

  it("keeps the workspace index stable until an explicit refresh", async () => {
    const root = await fixture();
    const index = new MentionIndex();
    await index.search(root, "file", "package");
    await fsp.writeFile(path.join(root, "package.json"), "{}");
    expect(await index.search(root, "file", "pack")).toEqual([]);
    await index.refresh(root);
    expect(await index.search(root, "file", "pack")).toEqual([
      expect.objectContaining({ kind: "file", path: "package.json" }),
    ]);
  });
});
