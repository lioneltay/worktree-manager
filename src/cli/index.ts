#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { removeCommand } from "./commands/remove.js";
import { pruneCommand } from "./commands/prune.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("wt")
  .description("Git worktree manager for parallel agent workspaces")
  .version(version);

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(removeCommand);
program.addCommand(pruneCommand);

// If no subcommand is provided, launch the interactive TUI
if (process.argv.length <= 2) {
  import("../tui/index.js").then(({ launchTui }) => launchTui());
} else {
  program.parse();
}
