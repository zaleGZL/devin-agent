import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceItem } from "../shared/types";

export class RecentWorkspaces {
  constructor(private readonly file: string) {}

  async list(): Promise<WorkspaceItem[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isWorkspaceItem).slice(0, 12);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      return [];
    }
  }

  async touch(workspacePath: string): Promise<WorkspaceItem[]> {
    const resolved = path.resolve(workspacePath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error("Selected workspace is not a folder");
    const current = await this.list();
    const next = [
      {
        path: resolved,
        name: path.basename(resolved) || resolved,
        lastOpenedAt: new Date().toISOString(),
      },
      ...current.filter((item) => item.path !== resolved),
    ].slice(0, 12);
    await this.write(next);
    return next;
  }

  async forget(workspacePath: string): Promise<WorkspaceItem[]> {
    const next = (await this.list()).filter((item) => item.path !== workspacePath);
    await this.write(next);
    return next;
  }

  async reorder(workspacePaths: string[]): Promise<WorkspaceItem[]> {
    const current = await this.list();
    const byPath = new Map(current.map((item) => [item.path, item]));
    const seen = new Set<string>();
    const next = workspacePaths.flatMap((workspacePath) => {
      if (seen.has(workspacePath)) return [];
      seen.add(workspacePath);
      const item = byPath.get(workspacePath);
      return item ? [item] : [];
    });
    next.push(...current.filter((item) => !seen.has(item.path)));
    await this.write(next);
    return next;
  }

  async rename(workspacePath: string, name: string): Promise<WorkspaceItem[]> {
    const resolved = path.resolve(workspacePath);
    const normalized = name.trim();
    if (!normalized) throw new Error("Project name must not be empty");
    if (normalized.length > 120) throw new Error("Project name must be 1–120 characters");
    const current = await this.list();
    const target = current.find((item) => item.path === resolved);
    if (!target) throw new Error("Only known projects can be renamed");
    const next = current.map((item) => (item.path === resolved ? { ...item, name: normalized } : item));
    await this.write(next);
    return next;
  }

  private async write(items: WorkspaceItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
  }
}

function isWorkspaceItem(value: unknown): value is WorkspaceItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as WorkspaceItem).path === "string" &&
      typeof (value as WorkspaceItem).name === "string" &&
      typeof (value as WorkspaceItem).lastOpenedAt === "string",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
