import { simpleGit, type SimpleGit } from "simple-git";
import type { GitWorktree } from "../types.js";

/**
 * Create a simple-git instance for the given directory
 */
export function createGit(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

/**
 * Check if a local branch exists
 */
export async function localBranchExists(
  git: SimpleGit,
  branch: string,
): Promise<boolean> {
  try {
    const result = await git.branchLocal();
    return result.all.includes(branch);
  } catch {
    return false;
  }
}

/**
 * Check if a remote branch exists.
 *
 * First checks local remote-tracking refs (no network call).
 * If not found locally, queries the remote directly via ls-remote.
 * If found on remote, fetches just that branch so worktree add will work.
 */
export async function remoteBranchExists(
  git: SimpleGit,
  branch: string,
  remote: string = "origin",
): Promise<boolean> {
  try {
    // First check local remote-tracking refs (no network)
    const result = await git.branch(["-r"]);
    if (result.all.includes(`${remote}/${branch}`)) {
      return true;
    }

    // Query remote directly to see if branch exists there
    const lsRemote = await git.listRemote([remote, `refs/heads/${branch}`]);
    if (lsRemote.trim().length > 0) {
      // Fetch just this branch so worktree add will work
      await git.fetch([remote, `${branch}:refs/remotes/${remote}/${branch}`]);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * List all git worktrees
 */
export async function listGitWorktrees(git: SimpleGit): Promise<GitWorktree[]> {
  const result = await git.raw(["worktree", "list", "--porcelain"]);
  const worktrees: GitWorktree[] = [];

  let current: Partial<GitWorktree> = {};

  for (const line of result.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        worktrees.push(current as GitWorktree);
      }
      current = { path: line.slice(9) };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      // branch refs/heads/main -> main
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "detached") {
      current.branch = null;
    }
  }

  if (current.path) {
    worktrees.push(current as GitWorktree);
  }

  return worktrees;
}

/**
 * Add a worktree for an existing branch
 */
export async function addWorktree(
  git: SimpleGit,
  path: string,
  branch: string,
): Promise<void> {
  await git.raw(["worktree", "add", path, branch]);
}

/**
 * Add a worktree with a new branch
 */
export async function addWorktreeNewBranch(
  git: SimpleGit,
  path: string,
  branch: string,
  from?: string,
): Promise<void> {
  const args = ["worktree", "add", "-b", branch, path];
  if (from) {
    args.push(from);
  }
  await git.raw(args);
}

/**
 * Add a worktree tracking a remote branch
 */
export async function addWorktreeTrackRemote(
  git: SimpleGit,
  path: string,
  branch: string,
  remote: string = "origin",
): Promise<void> {
  await git.raw([
    "worktree",
    "add",
    "--track",
    "-b",
    branch,
    path,
    `${remote}/${branch}`,
  ]);
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  git: SimpleGit,
  path: string,
  force: boolean = false,
): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) {
    args.push("--force");
  }
  await git.raw(args);
}

/**
 * Prune stale worktrees
 */
export async function pruneWorktrees(git: SimpleGit): Promise<void> {
  await git.raw(["worktree", "prune"]);
}

/**
 * Get status of a worktree (modified files, etc.)
 * @param worktreePath - Path to the worktree
 * @param existingGit - Optional existing SimpleGit instance to reuse
 */
export async function getWorktreeStatus(
  worktreePath: string,
  existingGit?: SimpleGit,
): Promise<{ modified: number; untracked: number }> {
  const g = existingGit ?? createGit(worktreePath);
  const status = await g.status();
  return {
    modified:
      status.modified.length + status.staged.length + status.deleted.length,
    untracked: status.not_added.length,
  };
}

/**
 * Get ahead/behind counts for a branch
 */
export async function getAheadBehind(
  git: SimpleGit,
  branch: string,
): Promise<{ ahead: number; behind: number }> {
  try {
    const result = await git.raw([
      "rev-list",
      "--left-right",
      "--count",
      `${branch}...origin/${branch}`,
    ]);
    const [ahead, behind] = result.trim().split("\t").map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}
