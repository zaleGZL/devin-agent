import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces";

describe("RecentWorkspaces", () => {
  let tempDirectory = "";
  let storePath = "";

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "devin-agent-workspaces-"));
    storePath = path.join(tempDirectory, "recent-workspaces.json");
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it("forgets a project record without deleting its folder or files", async () => {
    const firstProject = path.join(tempDirectory, "first-project");
    const secondProject = path.join(tempDirectory, "second-project");
    const retainedFile = path.join(firstProject, "README.md");
    await fs.mkdir(firstProject);
    await fs.mkdir(secondProject);
    await fs.writeFile(retainedFile, "retained\n");
    const recentWorkspaces = new RecentWorkspaces(storePath);
    await recentWorkspaces.touch(firstProject);
    await recentWorkspaces.touch(secondProject);

    const remaining = await recentWorkspaces.forget(firstProject);

    expect(remaining.map((item) => item.path)).toEqual([secondProject]);
    await expect(fs.readFile(retainedFile, "utf8")).resolves.toBe("retained\n");
  });

  it("persists an explicit project order and appends omitted known projects", async () => {
    const firstProject = path.join(tempDirectory, "first-project");
    const secondProject = path.join(tempDirectory, "second-project");
    const thirdProject = path.join(tempDirectory, "third-project");
    await Promise.all([firstProject, secondProject, thirdProject].map((directory) => fs.mkdir(directory)));
    const recentWorkspaces = new RecentWorkspaces(storePath);
    await recentWorkspaces.touch(firstProject);
    await recentWorkspaces.touch(secondProject);
    await recentWorkspaces.touch(thirdProject);

    const reordered = await recentWorkspaces.reorder([firstProject, thirdProject, "/unknown/project"]);

    expect(reordered.map((item) => item.path)).toEqual([firstProject, thirdProject, secondProject]);
    await expect(recentWorkspaces.list()).resolves.toEqual(reordered);
  });
});
