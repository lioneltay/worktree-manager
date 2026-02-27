import { Command } from "commander";
import { prune } from "../../core/worktree.js";

export const pruneCommand = new Command("prune")
  .description("Remove stale worktrees")
  .option(
    "--stale <days>",
    "Remove worktrees created more than N days ago",
    parseInt,
  )
  .option("--dry-run", "Show what would be removed without removing")
  .action(async (options) => {
    try {
      const result = await prune({
        dryRun: options.dryRun,
        staleDays: options.stale,
      });

      // Show skipped worktrees with warnings
      if (result.skipped.length > 0) {
        console.log("⚠ Skipped (uncommitted changes):");
        for (const { name, reason } of result.skipped) {
          console.log(`  - ${name}: ${reason}`);
        }
        console.log("");
      }

      if (result.pruned.length === 0) {
        console.log("No stale worktrees found.");
        return;
      }

      if (options.dryRun) {
        console.log("Would remove:");
        for (const name of result.pruned) {
          console.log(`  - ${name}`);
        }
      } else {
        console.log(`✓ Removed ${result.pruned.length} stale worktree(s):`);
        for (const name of result.pruned) {
          console.log(`  - ${name}`);
        }
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });
