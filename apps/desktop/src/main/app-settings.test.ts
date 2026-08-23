import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppSettings } from "./app-settings";

describe("AppSettings", () => {
  let root: string;
  let file: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-settings-"));
    file = path.join(root, "app-settings.json");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("defaults to following the system", async () => {
    expect(await new AppSettings(file).getLanguage()).toBe("system");
  });

  it("persists language without replacing other settings", async () => {
    const settings = new AppSettings(file);
    await settings.setColorScheme("dark");
    await settings.setLanguage("zh-CN");

    expect(await settings.getLanguage()).toBe("zh-CN");
    expect(await settings.getColorScheme()).toBe("dark");
  });

  it("falls back to system for an unknown stored value", async () => {
    await fs.writeFile(file, JSON.stringify({ language: "fr" }));
    expect(await new AppSettings(file).getLanguage()).toBe("system");
  });

  it("defaults to the system color scheme and persists an explicit override", async () => {
    const settings = new AppSettings(file);
    expect(await settings.getColorScheme()).toBe("system");

    await settings.setColorScheme("light");
    expect(await settings.getColorScheme()).toBe("light");
  });

  it("ignores invalid color schemes and replaces them on save", async () => {
    await fs.writeFile(file, JSON.stringify({ colorScheme: "sepia" }));
    const settings = new AppSettings(file);
    expect(await settings.getColorScheme()).toBe("system");

    await settings.setColorScheme("dark");
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ colorScheme: "dark" });
  });

  it("hides the reasoning process by default and for invalid stored values", async () => {
    expect(await new AppSettings(file).getShowReasoningProcess()).toBe(false);

    await fs.writeFile(file, JSON.stringify({ showReasoningProcess: "yes" }));
    expect(await new AppSettings(file).getShowReasoningProcess()).toBe(false);
  });

  it("persists the reasoning process preference without replacing other settings", async () => {
    const settings = new AppSettings(file);
    await settings.setColorScheme("dark");
    await settings.setLanguage("zh-CN");
    await settings.setShowReasoningProcess(true);

    expect(await settings.getShowReasoningProcess()).toBe(true);
    expect(await settings.getColorScheme()).toBe("dark");
    expect(await settings.getLanguage()).toBe("zh-CN");
  });

  it("defaults the profile nickname to the system username", async () => {
    expect(await new AppSettings(file, "local-user").getProfile()).toEqual({ nickname: "local-user" });
  });

  it("persists a customized profile without replacing other settings", async () => {
    const settings = new AppSettings(file, "local-user");
    await settings.setLanguage("zh-CN");
    await settings.setProfile({ nickname: "Trys", avatarDataUrl: "data:image/png;base64,aA==" });

    expect(await settings.getProfile()).toEqual({ nickname: "Trys", avatarDataUrl: "data:image/png;base64,aA==" });
    expect(await settings.getLanguage()).toBe("zh-CN");
  });

  it("rejects an empty nickname and unsafe avatar formats", async () => {
    const settings = new AppSettings(file, "local-user");
    await expect(settings.setProfile({ nickname: "  " })).rejects.toThrow("Nickname is required");
    await expect(settings.setProfile({ nickname: "Trys", avatarDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" })).rejects.toThrow("Unsupported avatar image");
  });

  it("stores only an absolute Devin CLI executable path", async () => {
    const settings = new AppSettings(file);
    await expect(settings.setDevinCliPath("devin")).rejects.toThrow(/absolute/i);
    await settings.setDevinCliPath(process.execPath);
    expect(await settings.getDevinCliPath()).toBe(process.execPath);
    await settings.setDevinCliPath(null);
    expect(await settings.getDevinCliPath()).toBeNull();
  });

  it("persists a bounded, ordered list of pinned Devin models", async () => {
    const settings = new AppSettings(file);
    await settings.setPinnedModelIds(["glm-5-2-max", "adaptive"]);
    expect(await settings.getPinnedModelIds()).toEqual(["glm-5-2-max", "adaptive"]);
    await expect(settings.setPinnedModelIds(["adaptive", "adaptive"]))
      .rejects.toThrow(/unique/i);
    await expect(settings.setPinnedModelIds([""]))
      .rejects.toThrow(/non-empty/i);
  });

  it("persists one global model for newly created sessions", async () => {
    const settings = new AppSettings(file);
    expect(await settings.getNewSessionModelId()).toBeNull();

    await settings.setNewSessionModelId("  swe-1-7-medium  ");
    expect(await settings.getNewSessionModelId()).toBe("swe-1-7-medium");
    await expect(settings.setNewSessionModelId("  ")).rejects.toThrow(/non-empty/i);
    await expect(settings.setNewSessionModelId("m".repeat(201))).rejects.toThrow(/non-empty/i);
  });

  it("persists one global preferred mode without replacing other settings", async () => {
    const settings = new AppSettings(file);
    expect(await settings.getPreferredModeId()).toBeNull();

    await settings.setLanguage("zh-CN");
    await settings.setPreferredModeId("  bypass-permissions  ");

    expect(await settings.getPreferredModeId()).toBe("bypass-permissions");
    expect(await settings.getLanguage()).toBe("zh-CN");
    await expect(settings.setPreferredModeId("  ")).rejects.toThrow(/non-empty/i);
    await expect(settings.setPreferredModeId("m".repeat(201))).rejects.toThrow(/non-empty/i);
  });
});
