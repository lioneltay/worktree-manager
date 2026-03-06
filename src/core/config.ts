import * as fs from "node:fs";
import * as path from "node:path";
import type { WtConfig } from "../types.js";
import { getConfigPath } from "../utils/paths.js";

/**
 * Create a fresh default config object.
 * Returns a new object each time to prevent mutation of shared state.
 */
function createDefaultConfigObject(): WtConfig {
  return { ignoredFiles: {} };
}

function loadJsonFile(filePath: string): Partial<WtConfig> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Load config by merging .wt.json (project) with .wt.local.json (personal overrides)
 */
export function loadConfig(gitRoot: string): WtConfig {
  const projectConfig = loadJsonFile(getConfigPath(gitRoot));
  const localConfig = loadJsonFile(path.join(gitRoot, ".wt.local.json"));

  return { ...createDefaultConfigObject(), ...projectConfig, ...localConfig };
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
