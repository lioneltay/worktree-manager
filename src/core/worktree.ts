import * as fs from "node:fs";
import * as path from "node:path";
import type { WorktreeStatus } from "../types.js";
import {
  findGitRoot,
  getWorktreesDir,
  getWorktreePath,
  branchToFolderName,
  validateWorktreeName,
} from "../utils/paths.js";
import { loadConfig, createDefaultConfig } from "./config.js";
import {
  addWorktree as addToRegistry,
  removeWorktree as removeFromRegistry,
  loadRegistry,
} from "./metadata.js";
import { handleIgnoredFiles } from "./ignored-files.js";
import * as git from "./git.js";

export type InitOptions = {
  gitRoot?: string;
};

export type CreateOptions = {
  newBranch?: boolean;
  from?: string;
  name?: string;
  copyAll?: boolean;
  noIgnored?: boolean;
};

export type RemoveOptions = {
  force?: boolean;
};

/**
 * Build a WorktreeStatus object from git worktree info
 * Shared helper for list() and status() functions
 */
async function buildWorktreeStatus(
  worktreePath: string,
  name: string,
  wtInfo: { branch: string | null },
  metadata: { createdAt?: string } | undefined,
): Promise<WorktreeStatus> {
  const branch = wtInfo.branch ?? "detached";
  const worktreeGit = git.createGit(worktreePath);
  const wtStatus = await git.getWorktreeStatus(worktreePath, worktreeGit);
  const aheadBehind = wtInfo.branch
    ? await git.getAheadBehind(worktreeGit, wtInfo.branch)
    : { ahead: 0, behind: 0 };

  return {
    name,
    path: worktreePath,
    branch,
    status:
      wtStatus.modified > 0 || wtStatus.untracked > 0 ? "modified" : "clean",
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    createdAt: metadata?.createdAt ?? "",
    modified: wtStatus.modified,
    untracked: wtStatus.untracked,
  };
}

/**
 * Get the git root directory, throwing if not in a git repository
 */
function requireGitRoot(): string {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }
  return gitRoot;
}

/**
 * Ensure companion worktrees directory and metadata exist (minimal setup for worktree creation)
 */
function ensureWorktreesDir(gitRoot: string): void {
  const worktreesDir = getWorktreesDir(gitRoot);
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Create empty metadata registry if needed
  const metadataPath = path.join(worktreesDir, ".metadata.json");
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({ worktrees: {} }, null, 2) + "\n",
    );
  }
}

/**
 * Initialize worktree management in a repository (explicit `wt init`)
 */
export async function init(
  options: InitOptions = {},
): Promise<{ worktreesDir: string }> {
  const gitRoot = options.gitRoot ?? findGitRoot();
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }

  // Ensure directory structure exists
  ensureWorktreesDir(gitRoot);

  // Create default config (only on explicit init)
  createDefaultConfig(gitRoot);

  return { worktreesDir: getWorktreesDir(gitRoot) };
}

/**
 * Create a new worktree
 */
export async function create(
  branch: string,
  options: CreateOptions = {},
): Promise<{ name: string; path: string }> {
  const gitRoot = requireGitRoot();
  const g = git.createGit(gitRoot);

  // Determine folder name: use --name if provided, otherwise derive from branch
  // Convert slashes to -- in both cases for consistency
  const folderName =
    options.name !== undefined
      ? options.name.replace(/[/\\]/g, "--")
      : branchToFolderName(branch);

  // Validate the folder name (rejects .., invalid chars)
  validateWorktreeName(folderName);

  const worktreePath = getWorktreePath(gitRoot, folderName);

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Worktree '${folderName}' already exists`);
  }

  // Ensure .worktrees directory exists (without creating config file)
  ensureWorktreesDir(gitRoot);

  if (options.newBranch) {
    // Create new branch
    await git.addWorktreeNewBranch(g, worktreePath, branch, options.from);
  } else {
    // Auto-detect: local or remote
    const localExists = await git.localBranchExists(g, branch);
    const remoteExists = await git.remoteBranchExists(g, branch);

    if (localExists) {
      // Checkout existing local branch
      await git.addWorktree(g, worktreePath, branch);
    } else if (remoteExists) {
      // Create tracking branch from remote
      await git.addWorktreeTrackRemote(g, worktreePath, branch);
    } else {
      throw new Error(
        `Branch '${branch}' not found. Use -b to create a new branch.`,
      );
    }
  }

  // Handle ignored files
  const config = loadConfig(gitRoot);
  handleIgnoredFiles(gitRoot, worktreePath, config, {
    copyAll: options.copyAll,
    noIgnored: options.noIgnored,
  });

  // Add to registry
  addToRegistry(gitRoot, folderName, branch);

  return { name: folderName, path: worktreePath };
}

/**
 * List all worktrees
 */
export async function list(): Promise<WorktreeStatus[]> {
  const gitRoot = requireGitRoot();
  const g = git.createGit(gitRoot);
  const gitWorktrees = await git.listGitWorktrees(g);
  const registry = loadRegistry(gitRoot);

  const results: WorktreeStatus[] = [];

  for (const wt of gitWorktrees) {
    // Skip the main worktree
    if (wt.path === gitRoot) {
      continue;
    }

    // Skip worktrees where directory no longer exists (stale)
    if (!fs.existsSync(wt.path)) {
      continue;
    }

    const name = path.basename(wt.path);
    const metadata = registry.worktrees[name];
    const worktreeStatus = await buildWorktreeStatus(
      wt.path,
      name,
      wt,
      metadata,
    );
    results.push(worktreeStatus);
  }

  return results;
}

/**
 * Get the main worktree status (the original repo checkout)
 */
export async function getMainWorktree(): Promise<WorktreeStatus | null> {
  const gitRoot = requireGitRoot();
  const g = git.createGit(gitRoot);
  const gitWorktrees = await git.listGitWorktrees(g);
  const main = gitWorktrees.find((wt) => wt.path === gitRoot);
  if (!main) return null;
  return buildWorktreeStatus(gitRoot, path.basename(gitRoot), main, undefined);
}

/**
 * Get status of a single worktree
 * Directly fetches the specific worktree's info rather than listing all worktrees
 */
export async function status(
  name: string,
  options: { path?: string } = {},
): Promise<WorktreeStatus | null> {
  const gitRoot = requireGitRoot();
  const worktreePath = options.path ?? getWorktreePath(gitRoot, name);

  // Check if worktree directory exists
  if (!fs.existsSync(worktreePath)) {
    return null;
  }

  const registry = loadRegistry(gitRoot);
  const metadata = registry.worktrees[name];

  // Get git info for this worktree - need to find the branch from git worktree list
  const g = git.createGit(gitRoot);
  const gitWorktrees = await git.listGitWorktrees(g);
  const wtInfo = gitWorktrees.find((wt) => wt.path === worktreePath);

  // If not in git's worktree list, the worktree may be corrupted
  if (!wtInfo) {
    return null;
  }

  return buildWorktreeStatus(worktreePath, name, wtInfo, metadata);
}

/**
 * Remove a worktree
 */
export async function remove(
  name: string,
  options: RemoveOptions & { path?: string } = {},
): Promise<void> {
  const gitRoot = requireGitRoot();
  const worktreePath = options.path ?? getWorktreePath(gitRoot, name);

  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree '${name}' not found`);
  }

  const g = git.createGit(gitRoot);

  // Check for uncommitted changes
  if (!options.force) {
    const wtStatus = await git.getWorktreeStatus(worktreePath);
    if (wtStatus.modified > 0 || wtStatus.untracked > 0) {
      throw new Error(
        `Worktree '${name}' has uncommitted changes. Use --force to remove anyway.`,
      );
    }
  }

  // Remove the worktree
  await git.removeWorktree(g, worktreePath, options.force);

  // Remove from registry
  removeFromRegistry(gitRoot, name);
}

export type PruneResult = {
  pruned: string[];
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Prune stale worktrees.
 *
 * @param options.staleDays - Remove worktrees created more than N days ago.
 *   Note: This uses creation time, not last activity time.
 * @param options.dryRun - Show what would be removed without removing.
 */
export async function prune(
  options: { dryRun?: boolean; staleDays?: number } = {},
): Promise<PruneResult> {
  const gitRoot = requireGitRoot();
  const g = git.createGit(gitRoot);
  const registry = loadRegistry(gitRoot);
  const worktreesDir = getWorktreesDir(gitRoot);
  const pruned: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  // First, let git prune its stale entries
  if (!options.dryRun) {
    await git.pruneWorktrees(g);
  }

  // Check registry for entries that no longer exist on disk
  for (const [name, metadata] of Object.entries(registry.worktrees)) {
    const worktreePath = path.join(worktreesDir, name);
    let shouldPrune = false;

    // Check if directory no longer exists
    if (!fs.existsSync(worktreePath)) {
      shouldPrune = true;
    }

    // Check if stale (created more than N days ago)
    if (
      options.staleDays &&
      metadata.createdAt &&
      fs.existsSync(worktreePath)
    ) {
      const createdAt = new Date(metadata.createdAt);
      const staleCutoff = new Date();
      staleCutoff.setDate(staleCutoff.getDate() - options.staleDays);
      if (createdAt < staleCutoff) {
        // Check for uncommitted changes before pruning stale worktrees
        const wtStatus = await git.getWorktreeStatus(worktreePath);
        if (wtStatus.modified > 0 || wtStatus.untracked > 0) {
          skipped.push({
            name,
            reason: `has uncommitted changes (${wtStatus.modified} modified, ${wtStatus.untracked} untracked)`,
          });
          continue;
        }
        shouldPrune = true;
      }
    }

    if (shouldPrune) {
      pruned.push(name);
      if (!options.dryRun) {
        // Remove from disk if exists
        if (fs.existsSync(worktreePath)) {
          await git.removeWorktree(g, worktreePath, true);
        }
        removeFromRegistry(gitRoot, name);
      }
    }
  }

  return { pruned, skipped };
}
