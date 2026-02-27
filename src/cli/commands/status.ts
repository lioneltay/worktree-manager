import { Command } from "commander";
import { status, list } from "../../core/worktree.js";

export const statusCommand = new Command("status")
  .description("Show worktree status")
  .argument("[worktree]", "Worktree name (shows all if omitted)")
  .option("--json", "Output as JSON")
  .action(async (worktree: string | undefined, options) => {
    try {
      if (worktree) {
        // Show single worktree
        const wt = await status(worktree);

        if (!wt) {
          console.error(`Worktree '${worktree}' not found`);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(wt, null, 2));
          return;
        }

        console.log(`Worktree: ${wt.name}`);
        console.log(`  Path: ${wt.path}`);
        console.log(`  Branch: ${wt.branch}`);
        if (wt.ahead > 0 || wt.behind > 0) {
          console.log(`  Upstream: ahead ${wt.ahead}, behind ${wt.behind}`);
        }
        console.log(
          `  Status: ${wt.modified} modified, ${wt.untracked} untracked`,
        );
        if (wt.createdAt) {
          console.log(`  Created: ${wt.createdAt}`);
        }
      } else {
        // Show all worktrees
        const worktrees = await list();

        if (options.json) {
          console.log(JSON.stringify({ worktrees }, null, 2));
          return;
        }

        if (worktrees.length === 0) {
          console.log("No worktrees found.");
          return;
        }

        for (const wt of worktrees) {
          const statusStr =
            wt.status === "modified"
              ? `${wt.modified} modified, ${wt.untracked} untracked`
              : "clean";
          console.log(`${wt.name} (${wt.branch}): ${statusStr}`);
        }
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });
