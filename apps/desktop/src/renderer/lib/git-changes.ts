import type { WorkspaceChange, WorkspaceChanges } from "../../shared/types";

function sameChange(left: WorkspaceChange, right: WorkspaceChange): boolean {
  return left.path === right.path
    && left.oldPath === right.oldPath
    && left.kind === right.kind
    && left.indexStatus === right.indexStatus
    && left.workingTreeStatus === right.workingTreeStatus
    && left.staged === right.staged
    && left.unstaged === right.unstaged;
}

/** Compares render-relevant Git state while intentionally ignoring checkedAt. */
export function sameWorkspaceChanges(left: WorkspaceChanges | undefined, right: WorkspaceChanges): boolean {
  if (!left) return false;
  if (
    left.workspacePath !== right.workspacePath
    || left.repositoryRoot !== right.repositoryRoot
    || left.branch !== right.branch
    || left.isRepository !== right.isRepository
    || left.changes.length !== right.changes.length
  ) return false;

  return left.changes.every((change, index) => sameChange(change, right.changes[index]));
}
