import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WeixinSecrets } from "./secrets";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("WeixinSecrets", () => {
  it("encrypts credentials when secure storage is available", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-weixin-secrets-"));
    temporary.push(root);
    const file = path.join(root, "credentials.json");
    const secrets = new WeixinSecrets(file, async () => ({
      available: () => true,
      encrypt: (value) => Buffer.from(value.split("").reverse().join("")),
      decrypt: (value) => value.toString().split("").reverse().join(""),
    }));
    await secrets.write({ token: "secret-token", contextToken: "context" });
    expect(await fs.readFile(file, "utf8")).not.toContain("secret-token");
    expect(await secrets.read()).toEqual({ token: "secret-token", contextToken: "context" });
    await secrets.clear();
    await expect(fs.access(file)).rejects.toThrow();
  });
});
