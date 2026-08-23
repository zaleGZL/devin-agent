import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRoutingIndex, parseCliEntries, syncDevinCliDocs } from "./sync-devin-cli-docs.mjs";

const INDEX_URL = "https://docs.devin.ai/llms.txt";

test("parseCliEntries 只保留安全且唯一的 CLI Markdown 文档", () => {
  const entries = parseCliEntries(`
- [Unrelated](https://docs.devin.ai/desktop/index.md): ignore
- [Quickstart](https://docs.devin.ai/cli/index.md): Start here
- [Configuration](https://docs.devin.ai/cli/reference/configuration/config-file.md)
`);

  assert.deepEqual(entries, [
    {
      title: "Quickstart",
      description: "Start here",
      url: "https://docs.devin.ai/cli/index.md",
      localPath: "index.md",
    },
    {
      title: "Configuration",
      description: "",
      url: "https://docs.devin.ai/cli/reference/configuration/config-file.md",
      localPath: "reference/configuration/config-file.md",
    },
  ]);

  assert.throws(
    () => parseCliEntries("- [Unsafe](https://docs.devin.ai/cli/%2E%2E/secret.md)"),
    /未发现任何/,
  );
  assert.throws(
    () => parseCliEntries("- [A](https://docs.devin.ai/cli/a.md)\n- [A again](https://docs.devin.ai/cli/a.md)"),
    /重复/,
  );
});

test("buildRoutingIndex 按路径生成可导航的确定性索引", () => {
  const entries = parseCliEntries(`
- [Quickstart](https://docs.devin.ai/cli/index.md): Start here
- [Zed](https://docs.devin.ai/cli/acp/zed.md): ACP integration
- [Stable](https://docs.devin.ai/cli/changelog/stable.md): Releases
`);
  const index = buildRoutingIndex(entries);

  assert.match(index, /### Getting started & core usage/);
  assert.match(index, /\[Quickstart]\(devin-cli\/index\.md\): Start here/);
  assert.match(index, /### IDE integration \(ACP\)/);
  assert.match(index, /### Changelog/);
});

test("syncDevinCliDocs 同步新增和更新文档并删除远端已移除文档", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "devin-docs-sync-test-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "docs", "devin-cli"), { recursive: true });
  await writeFile(path.join(projectRoot, "docs", "devin-cli", "keep.md"), "old content", "utf8");
  await writeFile(path.join(projectRoot, "docs", "devin-cli", "removed.md"), "removed", "utf8");

  const responses = new Map([
    [
      INDEX_URL,
      "- [Keep](https://docs.devin.ai/cli/keep.md): Updated\n- [New](https://docs.devin.ai/cli/new/page.md): Added\n",
    ],
    ["https://docs.devin.ai/cli/keep.md", "new content"],
    ["https://docs.devin.ai/cli/new/page.md", "new page"],
  ]);
  const fetchImpl = createFetch(responses);

  const result = await syncDevinCliDocs({ projectRoot, fetchImpl, retries: 1 });

  assert.deepEqual(result.added, ["new/page.md"]);
  assert.deepEqual(result.updated, ["keep.md"]);
  assert.deepEqual(result.deleted, ["removed.md"]);
  assert.equal(await readFile(path.join(projectRoot, "docs", "devin-cli", "keep.md"), "utf8"), "new content");
  assert.equal(await readFile(path.join(projectRoot, "docs", "devin-cli", "new", "page.md"), "utf8"), "new page");
  await assert.rejects(readFile(path.join(projectRoot, "docs", "devin-cli", "removed.md")), /ENOENT/);
  assert.match(await readFile(path.join(projectRoot, "docs", "devin-cli.md"), "utf8"), /new\/page\.md/);

  const secondResult = await syncDevinCliDocs({ projectRoot, fetchImpl, retries: 1 });
  assert.deepEqual(secondResult, {
    added: [],
    updated: [],
    deleted: [],
    unchanged: 2,
    indexChanged: false,
  });
});

test("syncDevinCliDocs 在任一下载失败时保留原知识库", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "devin-docs-sync-failure-test-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const mirror = path.join(projectRoot, "docs", "devin-cli");
  await mkdir(mirror, { recursive: true });
  await writeFile(path.join(mirror, "existing.md"), "still here", "utf8");

  const fetchImpl = createFetch(
    new Map([[INDEX_URL, "- [Missing](https://docs.devin.ai/cli/missing.md): Missing\n"]]),
  );

  await assert.rejects(syncDevinCliDocs({ projectRoot, fetchImpl, retries: 1 }), /下载失败/);
  assert.equal(await readFile(path.join(mirror, "existing.md"), "utf8"), "still here");
});

function createFetch(responses) {
  return async (url) => {
    const body = responses.get(String(url));
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      text: async () => body ?? "not found",
    };
  };
}
