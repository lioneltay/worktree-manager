import { Command } from "commander";
import { list } from "../../core/worktree.js";

// Table column widths for consistent formatting
const COL_WORKTREE = 20;
const COL_BRANCH = 25;
const COL_STATUS = 12;

// Time constants for relative time formatting (in milliseconds)
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export const listCommand = new Command("list")
  .description("List all worktrees")
  .option("--json", "Output as JSON")
  .option("-q, --quiet", "Only show worktree names")
  .action(async (options) => {
    try {
      const worktrees = await list();

      if (options.json) {
        console.log(JSON.stringify({ worktrees }, null, 2));
        return;
      }

      if (options.quiet) {
        for (const wt of worktrees) {
          console.log(wt.name);
        }
        return;
      }

      if (worktrees.length === 0) {
        console.log(
          "No worktrees found. Use 'wt create <branch>' to create one.",
        );
        return;
      }

      // Table header
      console.log(
        padRight("WORKTREE", COL_WORKTREE) +
          padRight("BRANCH", COL_BRANCH) +
          padRight("STATUS", COL_STATUS) +
          "CREATED",
      );

      for (const wt of worktrees) {
        const createdAt = wt.createdAt
          ? formatRelativeTime(new Date(wt.createdAt))
          : "-";

        console.log(
          padRight(wt.name, COL_WORKTREE) +
            padRight(wt.branch, COL_BRANCH) +
            padRight(wt.status, COL_STATUS) +
            createdAt,
        );
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

function padRight(str: string, len: number): string {
  return str.length >= len ? str + " " : str + " ".repeat(len - str.length);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
  const diffHours = Math.floor(diffMs / MS_PER_HOUR);
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
