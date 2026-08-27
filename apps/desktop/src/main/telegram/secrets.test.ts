import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TelegramSecrets } from "./secrets";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("TelegramSecrets", () => {
  it("encrypts credentials when secure storage is available", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-telegram-secrets-"));
    temporary.push(root);
    const file = path.join(root, "credentials.json");
    const secrets = new TelegramSecrets(file, async () => ({
      available: () => true,
      encrypt: (value) => Buffer.from(value.split("").reverse().join("")),
      decrypt: (value) => value.toString().split("").reverse().join(""),
    }));
    await secrets.write({ botToken: "123456789:AAsecret-token" });
    expect(await fs.readFile(file, "utf8")).not.toContain("AAsecret-token");
    expect(await secrets.read()).toEqual({ botToken: "123456789:AAsecret-token" });
    await secrets.clear();
    await expect(fs.access(file)).rejects.toThrow();
  });

  it("falls back to plaintext when secure storage is unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-telegram-secrets-"));
    temporary.push(root);
    const file = path.join(root, "credentials.json");
    const secrets = new TelegramSecrets(file, async () => undefined);
    await secrets.write({ botToken: "123456789:AAplain-token" });
    const data = JSON.parse(await fs.readFile(file, "utf8")) as { plaintext?: { botToken?: string } };
    expect(data.plaintext?.botToken).toBe("123456789:AAplain-token");
    expect(await secrets.read()).toEqual({ botToken: "123456789:AAplain-token" });
  });
});
