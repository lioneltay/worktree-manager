import * as fs from "node:fs";
import type { WorktreeRegistry } from "../types.js";
import { getMetadataPath } from "../utils/paths.js";

/**
 * Create a fresh empty registry object.
 * Returns a new object each time to prevent mutation of shared state.
 */
function createEmptyRegistry(): WorktreeRegistry {
  return { worktrees: {} };
}

/**
 * Load the metadata registry
 */
export function loadRegistry(gitRoot: string): WorktreeRegistry {
  const metadataPath = getMetadataPath(gitRoot);

  if (!fs.existsSync(metadataPath)) {
    return createEmptyRegistry();
  }

  try {
    const content = fs.readFileSync(metadataPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return createEmptyRegistry();
  }
}

/**
 * Save the metadata registry
 */
export function saveRegistry(
  gitRoot: string,
  registry: WorktreeRegistry,
): void {
  const metadataPath = getMetadataPath(gitRoot);
  fs.writeFileSync(metadataPath, JSON.stringify(registry, null, 2) + "\n");
}

/**
 * Add a worktree to the registry
 */
export function addWorktree(
  gitRoot: string,
  name: string,
  branch: string,
): void {
  const registry = loadRegistry(gitRoot);

  registry.worktrees[name] = {
    name,
    branch,
    createdAt: new Date().toISOString(),
  };

  saveRegistry(gitRoot, registry);
}

/**
 * Remove a worktree from the registry
 */
export function removeWorktree(gitRoot: string, name: string): void {
  const registry = loadRegistry(gitRoot);
  delete registry.worktrees[name];
  saveRegistry(gitRoot, registry);
}
