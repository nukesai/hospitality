import { execFileSync } from "node:child_process";

export interface WorktreeStatus {
  readonly isRepo: boolean;
  readonly isDirty: boolean;
}

/** Read-only porcelain status of the consumer worktree. */
export function worktreeStatus(cwd: string): WorktreeStatus {
  let stdout: string;
  try {
    stdout = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return { isRepo: false, isDirty: false };
  }
  return { isRepo: true, isDirty: stdout.trim().length > 0 };
}

/**
 * The CLI writes into CUSTOMER repositories. Refuse to touch a dirty worktree
 * unless --force, so every scaffold lands as a clean, reviewable diff.
 */
export function assertCleanWorktree(cwd: string, force: boolean): void {
  if (force) return;
  const status = worktreeStatus(cwd);
  if (!status.isRepo) {
    throw new Error("Not a git repository. Initialise git first, or re-run with --force.");
  }
  if (status.isDirty) {
    throw new Error(
      "Git worktree is dirty. Commit or stash your changes first, or re-run with --force.",
    );
  }
}
