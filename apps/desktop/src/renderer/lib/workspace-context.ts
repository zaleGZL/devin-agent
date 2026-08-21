export function resolveNewTaskCwd(workspace: string | undefined, homeDirectory: string): string {
  return workspace ?? homeDirectory;
}
