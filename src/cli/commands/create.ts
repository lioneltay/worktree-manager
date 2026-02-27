import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "../../core/worktree.js";

export const createCommand = new Command("create")
  .description("Create a new worktree")
  .argument("<branch>", "Branch to checkout (auto-detects local or remote)")
  .option(
    "-b, --new-branch",
    "Create a new branch instead of checking out existing",
  )
  .option("--from <base>", "Base commit/branch for new branch (default: HEAD)")
  .option(
    "--name <folder>",
    "Override folder name (default: branch with / → -)",
  )
  .option("--copy-all", "Copy ignored files instead of symlink")
  .option("--no-ignored", "Skip ignored file handling")
  .option("--meta <json>", "Metadata JSON to write to .worktree-meta.json")
  .action(async (branch: string, options) => {
    try {
      const result = await create(branch, {
        newBranch: options.newBranch,
        from: options.from,
        name: options.name,
        copyAll: options.copyAll,
        noIgnored: !options.ignored,
      });

      // Write metadata file if --meta provided
      if (options.meta) {
        try {
          const meta = JSON.parse(options.meta);
          writeFileSync(
            join(result.path, ".worktree-meta.json"),
            JSON.stringify(meta, null, 2) + "\n",
          );
        } catch {
          console.error(
            "Warning: Invalid JSON for --meta, skipping metadata file",
          );
        }
      }

      console.log(`✓ Created worktree '${result.name}'`);
      console.log(`  Path: ${result.path}`);
      console.log(`  Branch: ${branch}`);
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });
