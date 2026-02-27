import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRegistry,
  saveRegistry,
  addWorktree,
  removeWorktree,
} from "./metadata.js";

describe("metadata", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wt-metadata-test-"));
    // Create sibling companion .worktrees directory
    mkdirSync(tempDir + ".worktrees");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(tempDir + ".worktrees", { recursive: true, force: true });
  });

  describe("loadRegistry", () => {
    it("returns empty registry when file does not exist", () => {
      const registry = loadRegistry(tempDir);
      expect(registry).toEqual({ worktrees: {} });
    });

    it("returns empty registry when file is corrupted JSON", () => {
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      writeFileSync(metadataPath, "{ invalid json }");

      const registry = loadRegistry(tempDir);
      expect(registry).toEqual({ worktrees: {} });
    });

    it("returns empty registry when file is empty", () => {
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      writeFileSync(metadataPath, "");

      const registry = loadRegistry(tempDir);
      expect(registry).toEqual({ worktrees: {} });
    });

    it("loads valid registry from file", () => {
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      const testRegistry = {
        worktrees: {
          "feature-x": {
            name: "feature-x",
            branch: "feature-x",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };
      writeFileSync(metadataPath, JSON.stringify(testRegistry));

      const registry = loadRegistry(tempDir);
      expect(registry).toEqual(testRegistry);
    });
  });

  describe("saveRegistry", () => {
    it("saves registry to file with pretty formatting", () => {
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      const testRegistry = {
        worktrees: {
          "feature-x": {
            name: "feature-x",
            branch: "feature-x",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      saveRegistry(tempDir, testRegistry);

      const content = readFileSync(metadataPath, "utf-8");
      expect(content).toBe(JSON.stringify(testRegistry, null, 2) + "\n");
    });

    it("overwrites existing file", () => {
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      writeFileSync(metadataPath, JSON.stringify({ worktrees: { old: {} } }));

      const newRegistry = {
        worktrees: {
          new: {
            name: "new",
            branch: "new",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };
      saveRegistry(tempDir, newRegistry);

      const loaded = loadRegistry(tempDir);
      expect(loaded).toEqual(newRegistry);
    });
  });

  describe("addWorktree", () => {
    it("adds worktree to empty registry", () => {
      addWorktree(tempDir, "feature-x", "feature-x");

      const registry = loadRegistry(tempDir);
      const entry = registry.worktrees["feature-x"];
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("feature-x");
      expect(entry!.branch).toBe("feature-x");
      expect(entry!.createdAt).toBeDefined();
    });

    it("adds worktree to existing registry", () => {
      addWorktree(tempDir, "feature-x", "feature-x");
      addWorktree(tempDir, "feature-y", "feature-y");

      const registry = loadRegistry(tempDir);
      expect(Object.keys(registry.worktrees)).toHaveLength(2);
      expect(registry.worktrees["feature-x"]).toBeDefined();
      expect(registry.worktrees["feature-y"]).toBeDefined();
    });

    it("overwrites existing worktree entry", () => {
      addWorktree(tempDir, "feature-x", "old-branch");
      addWorktree(tempDir, "feature-x", "new-branch");

      const registry = loadRegistry(tempDir);
      const entry = registry.worktrees["feature-x"];
      expect(entry).toBeDefined();
      expect(entry!.branch).toBe("new-branch");
    });

    it("sets createdAt to current timestamp", () => {
      const before = new Date().toISOString();
      addWorktree(tempDir, "feature-x", "feature-x");
      const after = new Date().toISOString();

      const registry = loadRegistry(tempDir);
      const entry = registry.worktrees["feature-x"];
      expect(entry).toBeDefined();
      const createdAt = entry!.createdAt;

      expect(createdAt >= before).toBe(true);
      expect(createdAt <= after).toBe(true);
    });
  });

  describe("removeWorktree", () => {
    it("removes worktree from registry", () => {
      addWorktree(tempDir, "feature-x", "feature-x");
      addWorktree(tempDir, "feature-y", "feature-y");

      removeWorktree(tempDir, "feature-x");

      const registry = loadRegistry(tempDir);
      expect(registry.worktrees["feature-x"]).toBeUndefined();
      expect(registry.worktrees["feature-y"]).toBeDefined();
    });

    it("handles removing non-existent worktree gracefully", () => {
      addWorktree(tempDir, "feature-x", "feature-x");

      // Should not throw
      expect(() => removeWorktree(tempDir, "nonexistent")).not.toThrow();

      const registry = loadRegistry(tempDir);
      expect(registry.worktrees["feature-x"]).toBeDefined();
    });

    it("handles empty registry gracefully", () => {
      expect(() => removeWorktree(tempDir, "nonexistent")).not.toThrow();
    });
  });
});
