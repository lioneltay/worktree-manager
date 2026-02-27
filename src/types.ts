/**
 * Configuration for handling ignored files when creating worktrees
 */
export type IgnoredFileMode = "symlink" | "copy" | "ignore";

export type WtConfig = {
  ignoredFiles?: Record<string, IgnoredFileMode>;
  open?: string;
};

/**
 * Metadata for a single worktree
 */
export type WorktreeMetadata = {
  name: string;
  branch: string;
  createdAt: string;
};

/**
 * Registry of all worktrees
 */
export type WorktreeRegistry = {
  worktrees: Record<string, WorktreeMetadata>;
};

/**
 * Status of a worktree
 */
export type WorktreeStatus = {
  name: string;
  path: string;
  branch: string;
  status: "clean" | "modified";
  ahead: number;
  behind: number;
  createdAt: string;
  modified: number;
  untracked: number;
};

/**
 * Result from git worktree list
 */
export type GitWorktree = {
  path: string;
  head: string;
  branch: string | null;
};
