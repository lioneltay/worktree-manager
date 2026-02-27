import { Command } from "commander";
import { remove } from "../../core/worktree.js";

export const removeCommand = new Command("remove")
  .description("Remove a worktree")
  .argument("<worktree>", "Worktree name to remove")
  .option("-f, --force", "Force remove even with uncommitted changes")
  .action(async (worktree: string, options) => {
    try {
      await remove(worktree, {
        force: options.force,
      });

      console.log(`✓ Removed worktree '${worktree}'`);
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });
