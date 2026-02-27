// Public API
export {
  init,
  create,
  list,
  status,
  remove,
  prune,
  type InitOptions,
  type CreateOptions,
  type RemoveOptions,
  type PruneResult,
} from "./core/worktree.js";
export { loadConfig, saveConfig } from "./core/config.js";
export {
  createGit,
  localBranchExists,
  remoteBranchExists,
} from "./core/git.js";
export type {
  WtConfig,
  IgnoredFileMode,
  WorktreeMetadata,
  WorktreeRegistry,
  WorktreeStatus,
} from "./types.js";
