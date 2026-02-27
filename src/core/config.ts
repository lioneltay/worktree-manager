import * as fs from "node:fs";
import type { WtConfig } from "../types.js";
import { getConfigPath } from "../utils/paths.js";

/**
 * Create a fresh default config object.
 * Returns a new object each time to prevent mutation of shared state.
 */
function createDefaultConfigObject(): WtConfig {
  return { ignoredFiles: {} };
}

/**
 * Load the .wt.json config file
 */
export function loadConfig(gitRoot: string): WtConfig {
  const configPath = getConfigPath(gitRoot);

  if (!fs.existsSync(configPath)) {
    return createDefaultConfigObject();
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return { ...createDefaultConfigObject(), ...JSON.parse(content) };
  } catch {
    return createDefaultConfigObject();
  }
}

/**
 * Save the .wt.json config file
 */
export function saveConfig(gitRoot: string, config: WtConfig): void {
  const configPath = getConfigPath(gitRoot);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Create default config file
 */
export function createDefaultConfig(gitRoot: string): void {
  const configPath = getConfigPath(gitRoot);

  if (fs.existsSync(configPath)) {
    return;
  }

  const defaultConfig: WtConfig = {
    ignoredFiles: {
      ".env": "symlink",
      ".env.local": "copy",
      "node_modules/": "ignore",
    },
  };

  saveConfig(gitRoot, defaultConfig);
}
