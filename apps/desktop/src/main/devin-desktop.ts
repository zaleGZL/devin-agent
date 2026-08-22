import { pathToFileURL } from "node:url";

/** Build the workspace URL understood by the official Devin Desktop app. */
export function createDevinWorkspaceUrl(workspacePath: string): string {
  const fileUrl = pathToFileURL(workspacePath);
  return `devin://file${fileUrl.pathname}`;
}
