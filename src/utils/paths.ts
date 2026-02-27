import * as path from "node:path";
import { execFileSync } from "node:child_process";

// Characters that are invalid on Windows filesystems
const INVALID_CHARS = /[:<>?*|]/;

// Path traversal pattern
const PATH_TRAVERSAL = /\.\./;

/**
 * Validate a worktree folder name
 * Throws an error if the name contains dangerous characters
 */
export function validateWorktreeName(name: string): void {
  if (!name || name.trim() === "") {
    throw new Error("Worktree name cannot be empty");
  }

  if (PATH_TRAVERSAL.test(name)) {
    throw new Error(
      `Invalid worktree name '${name}': contains '..' (path traversal not allowed)`,
    );
  }

  if (INVALID_CHARS.test(name)) {
    throw new Error(
      `Invalid worktree name '${name}': contains invalid characters (: < > ? * |)`,
    );
  }
}

/**
 * Convert branch name to folder name
 * - Removes origin/ prefix
 * - Converts / and \ to -- (double dash) to flatten hierarchy
 */
export function branchToFolderName(branch: string): string {
  // Remove origin/ prefix if present
  const localBranch = branch.replace(/^origin\//, "");
  // Replace slashes and backslashes with double dash
  return localBranch.replace(/[/\\]/g, "--");
}

/**
 * Find the git root directory from the current working directory.
 * Uses `git rev-parse --git-common-dir` to correctly handle worktrees,
 * returning the main repo root even when called from within a worktree.
 */
export function findGitRoot(cwd: string = process.cwd()): string | null {
  try {
    // git rev-parse --git-common-dir returns the .git dir of the main repo
    // This works correctly from both main repo and worktrees
    const gitCommonDir = execFileSync(
      "git",
      ["rev-parse", "--git-common-dir"],
      {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();

    // The git-common-dir can be relative or absolute
    // Resolve it and get its parent (the repo root)
    const resolvedGitDir = path.resolve(cwd, gitCommonDir);
    return path.dirname(resolvedGitDir);
  } catch {
    return null;
  }
}

/**
 * Get the companion worktrees directory path (sibling to repo)
 */
export function getWorktreesDir(gitRoot: string): string {
  return gitRoot + ".worktrees";
}

/**
 * Get the path to a specific worktree
 */
export function getWorktreePath(gitRoot: string, name: string): string {
  return path.join(getWorktreesDir(gitRoot), name);
}

/**
 * Get the path to the config file
 */
export function getConfigPath(gitRoot: string): string {
  return path.join(gitRoot, ".wt.json");
}

/**
 * Get the path to the metadata registry
 */
export function getMetadataPath(gitRoot: string): string {
  return path.join(getWorktreesDir(gitRoot), ".metadata.json");
}
