import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, createDefaultConfig } from "./config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wt-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadConfig", () => {
    it("returns empty config when file does not exist", () => {
      const config = loadConfig(tempDir);
      expect(config).toEqual({ ignoredFiles: {} });
    });

    it("returns empty config when file is corrupted JSON", () => {
      const configPath = join(tempDir, ".wt.json");
      writeFileSync(configPath, "{ invalid json }");

      const config = loadConfig(tempDir);
      expect(config).toEqual({ ignoredFiles: {} });
    });

    it("returns empty config when file is empty", () => {
      const configPath = join(tempDir, ".wt.json");
      writeFileSync(configPath, "");

      const config = loadConfig(tempDir);
      expect(config).toEqual({ ignoredFiles: {} });
    });

    it("loads valid config from file", () => {
      const configPath = join(tempDir, ".wt.json");
      const testConfig = {
        ignoredFiles: {
          ".env": "symlink",
          "secrets/": "ignore",
        },
      };
      writeFileSync(configPath, JSON.stringify(testConfig));

      const config = loadConfig(tempDir);
      expect(config).toEqual(testConfig);
    });

    it("merges with defaults for partial config", () => {
      const configPath = join(tempDir, ".wt.json");
      // Config without ignoredFiles
      writeFileSync(configPath, JSON.stringify({}));

      const config = loadConfig(tempDir);
      expect(config.ignoredFiles).toEqual({});
    });

    it("preserves existing ignoredFiles from config", () => {
      const configPath = join(tempDir, ".wt.json");
      const testConfig = {
        ignoredFiles: {
          ".env": "copy",
        },
      };
      writeFileSync(configPath, JSON.stringify(testConfig));

      const config = loadConfig(tempDir);
      expect(config.ignoredFiles?.[".env"]).toBe("copy");
    });
  });

  describe("saveConfig", () => {
    it("saves config to file with pretty formatting", () => {
      const testConfig = {
        ignoredFiles: {
          ".env": "symlink" as const,
        },
      };

      saveConfig(tempDir, testConfig);

      const configPath = join(tempDir, ".wt.json");
      const content = readFileSync(configPath, "utf-8");
      expect(content).toBe(JSON.stringify(testConfig, null, 2) + "\n");
    });

    it("overwrites existing file", () => {
      const configPath = join(tempDir, ".wt.json");
      writeFileSync(
        configPath,
        JSON.stringify({ ignoredFiles: { old: "ignore" } }),
      );

      const newConfig = {
        ignoredFiles: {
          new: "symlink" as const,
        },
      };
      saveConfig(tempDir, newConfig);

      const loaded = loadConfig(tempDir);
      expect(loaded.ignoredFiles?.["old"]).toBeUndefined();
      expect(loaded.ignoredFiles?.["new"]).toBe("symlink");
    });
  });

  describe("createDefaultConfig", () => {
    it("creates default config file when it does not exist", () => {
      createDefaultConfig(tempDir);

      const configPath = join(tempDir, ".wt.json");
      expect(existsSync(configPath)).toBe(true);

      const config = loadConfig(tempDir);
      expect(config.ignoredFiles?.[".env"]).toBe("symlink");
      expect(config.ignoredFiles?.[".env.local"]).toBe("copy");
      expect(config.ignoredFiles?.["node_modules/"]).toBe("ignore");
    });

    it("does not overwrite existing config file", () => {
      const configPath = join(tempDir, ".wt.json");
      const customConfig = {
        ignoredFiles: {
          ".custom": "copy",
        },
      };
      writeFileSync(configPath, JSON.stringify(customConfig));

      createDefaultConfig(tempDir);

      const config = loadConfig(tempDir);
      expect(config.ignoredFiles?.[".custom"]).toBe("copy");
      expect(config.ignoredFiles?.[".env"]).toBeUndefined();
    });

    it("is idempotent when file does not exist", () => {
      createDefaultConfig(tempDir);
      const firstContent = readFileSync(join(tempDir, ".wt.json"), "utf-8");

      createDefaultConfig(tempDir);
      const secondContent = readFileSync(join(tempDir, ".wt.json"), "utf-8");

      expect(firstContent).toBe(secondContent);
    });
  });
});
