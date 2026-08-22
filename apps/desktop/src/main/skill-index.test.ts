import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { GLOBAL_SKILL_ROOTS, parseSkillFrontmatter, PROJECT_SKILL_ROOTS, SkillIndex } from "./skill-index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fsp.rm(directory, { recursive: true, force: true })));
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

async function writeSkill(base: string, root: string, folder: string, name: string, description = ""): Promise<void> {
  const directory = path.join(base, root, folder);
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# Body must not be indexed\n`);
}

describe("SkillIndex", () => {
  it("parses bounded frontmatter including folded descriptions", () => {
    expect(parseSkillFrontmatter("---\r\nname: package-review\r\ndescription: >\r\n  Review package\r\n  metadata\r\n---\r\nbody")).toEqual({
      name: "package-review",
      description: "Review package metadata",
    });
    expect(parseSkillFrontmatter("---\nname: compact\ndescription: >-\n  Folded without\n  trailing newline\n---\nbody")).toEqual({
      name: "compact",
      description: "Folded without trailing newline",
    });
  });

  it("discovers all project roots and lets project Skills override global names", async () => {
    const home = await temporaryRoot("devin-skills-home-");
    const project = await temporaryRoot("devin-skills-project-");
    await writeSkill(home, ".agents/skills", "review", "review", "global");
    await Promise.all(PROJECT_SKILL_ROOTS.map((root, index) => writeSkill(project, root, `skill-${index}`, `project-${index}`)));
    await writeSkill(project, ".codex/skills", "review", "review", "project");
    const skills = await new SkillIndex(home).listDraft(project);
    expect(skills.filter((skill) => skill.command.startsWith("skill-"))).toHaveLength(PROJECT_SKILL_ROOTS.length);
    expect(skills.find((skill) => skill.command === "skill-0")?.label).toBe("project-0");
    expect(skills.find((skill) => skill.command === "review")).toEqual(expect.objectContaining({
      description: "project",
      scope: "project",
      source: ".codex/skills/review/SKILL.md",
    }));
  });

  it("discovers only Devin-supported global roots and uses the folder as the command", async () => {
    const home = await temporaryRoot("devin-skills-home-");
    await Promise.all(GLOBAL_SKILL_ROOTS.map((root, index) => writeSkill(home, root, `global-${index}`, `Global Skill ${index}`)));
    await writeSkill(home, ".claude/skills", "not-global", "Not Global");
    const skills = await new SkillIndex(home).listDraft();
    expect(skills.map((skill) => skill.command).sort()).toEqual(
      GLOBAL_SKILL_ROOTS.map((_root, index) => `global-${index}`).sort(),
    );
    expect(skills[0]?.label).toMatch(/^Global Skill /);
  });

  it("keeps session snapshots immutable while refreshing new-session drafts", async () => {
    const home = await temporaryRoot("devin-skills-home-");
    const project = await temporaryRoot("devin-skills-project-");
    await writeSkill(project, ".agents/skills", "first", "first");
    const index = new SkillIndex(home);
    const firstDraft = await index.refreshDraft(project);
    await index.bindSession("session-a", project, firstDraft);
    await writeSkill(project, ".agents/skills", "second", "second");
    expect((await index.listDraft(project)).map((skill) => skill.command)).toEqual(["first"]);
    const secondDraft = await index.refreshDraft(project);
    expect(secondDraft.map((skill) => skill.command)).toEqual(["first", "second"]);
    expect(index.getSession("session-a")?.map((skill) => skill.command)).toEqual(["first"]);
  });

  it("ignores symlinked Skill files", async () => {
    const home = await temporaryRoot("devin-skills-home-");
    const project = await temporaryRoot("devin-skills-project-");
    const target = path.join(project, "target.md");
    await fsp.writeFile(target, "---\nname: linked\n---\n");
    const directory = path.join(project, ".agents/skills/linked");
    await fsp.mkdir(directory, { recursive: true });
    await fsp.symlink(target, path.join(directory, "SKILL.md"));
    expect(await new SkillIndex(home).listDraft(project)).toEqual([]);
  });
});
