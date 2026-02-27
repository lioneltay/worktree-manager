import { Command } from "commander";
import { init } from "../../core/worktree.js";

export const initCommand = new Command("init")
  .description("Initialize worktree management in the current repository")
  .action(async () => {
    try {
      const { worktreesDir } = await init();
      console.log("✓ Worktree management initialized");
      console.log(`  Created worktrees directory at ${worktreesDir}`);
      console.log("  Created .wt.json config file");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });
