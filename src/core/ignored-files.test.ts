import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  lstatSync,
  readlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandIgnoredFiles, handleIgnoredFiles } from "./ignored-files.js";

describe("expandIgnoredFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wt-ignored-files-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes through non-glob entries unchanged", () => {
    const result = expandIgnoredFiles(tempDir, {
      ".env": "symlink",
      "node_modules/": "ignore",
    });
    expect(result).toEqual([
      [".env", "symlink"],
      ["node_modules/", "ignore"],
    ]);
  });

  it("expands a trailing `*` against matching directory entries", () => {
    mkdirSync(join(tempDir, "ai/skills/_foo"), { recursive: true });
    mkdirSync(join(tempDir, "ai/skills/_bar"), { recursive: true });
    mkdirSync(join(tempDir, "ai/skills/baz"), { recursive: true });

    const result = expandIgnoredFiles(tempDir, {
      "ai/skills/_*": "symlink",
    });

    const paths = result.map(([p]) => p).sort();
    expect(paths).toEqual(["ai/skills/_bar", "ai/skills/_foo"]);
    expect(result.every(([, mode]) => mode === "symlink")).toBe(true);
  });

  it("expands `*` against files", () => {
    mkdirSync(join(tempDir, "cfg"), { recursive: true });
    writeFileSync(join(tempDir, "cfg/a.json"), "{}");
    writeFileSync(join(tempDir, "cfg/b.json"), "{}");
    writeFileSync(join(tempDir, "cfg/c.yaml"), "");

    const result = expandIgnoredFiles(tempDir, {
      "cfg/*.json": "copy",
    });

    const paths = result.map(([p]) => p).sort();
    expect(paths).toEqual(["cfg/a.json", "cfg/b.json"]);
  });

  it("expands globs in intermediate path segments", () => {
    mkdirSync(join(tempDir, "packages/alpha"), { recursive: true });
    mkdirSync(join(tempDir, "packages/beta"), { recursive: true });
    writeFileSync(join(tempDir, "packages/alpha/config.json"), "{}");
    writeFileSync(join(tempDir, "packages/beta/config.json"), "{}");
    writeFileSync(join(tempDir, "packages/beta/other.json"), "{}");

    const result = expandIgnoredFiles(tempDir, {
      "packages/*/config.json": "symlink",
    });

    const paths = result.map(([p]) => p).sort();
    expect(paths).toEqual([
      "packages/alpha/config.json",
      "packages/beta/config.json",
    ]);
  });

  it("expands `?` to match single characters", () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "a.txt"), "");
    writeFileSync(join(tempDir, "b.txt"), "");
    writeFileSync(join(tempDir, "ab.txt"), "");

    const result = expandIgnoredFiles(tempDir, {
      "?.txt": "copy",
    });

    const paths = result.map(([p]) => p).sort();
    expect(paths).toEqual(["a.txt", "b.txt"]);
  });

  it("returns nothing when a glob matches no files", () => {
    const result = expandIgnoredFiles(tempDir, {
      "does/not/exist/*": "symlink",
    });
    expect(result).toEqual([]);
  });

  it("handles missing intermediate directories without throwing", () => {
    const result = expandIgnoredFiles(tempDir, {
      "missing/*/thing": "symlink",
    });
    expect(result).toEqual([]);
  });

  it("preserves the mode for each expanded match", () => {
    mkdirSync(join(tempDir, "logs"), { recursive: true });
    writeFileSync(join(tempDir, "logs/one.log"), "");
    writeFileSync(join(tempDir, "logs/two.log"), "");

    const result = expandIgnoredFiles(tempDir, {
      "logs/*.log": "ignore",
    });

    expect(result).toHaveLength(2);
    expect(result.every(([, mode]) => mode === "ignore")).toBe(true);
  });
});

describe("handleIgnoredFiles with globs", () => {
  let gitRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), "wt-handle-globs-test-"));
    gitRoot = join(tmp, "repo");
    worktreePath = join(tmp, "worktree");
    mkdirSync(gitRoot, { recursive: true });
    mkdirSync(worktreePath, { recursive: true });
  });

  afterEach(() => {
    rmSync(join(gitRoot, ".."), { recursive: true, force: true });
  });

  it("creates a symlink per glob match", () => {
    mkdirSync(join(gitRoot, "ai/skills/_foo"), { recursive: true });
    mkdirSync(join(gitRoot, "ai/skills/_bar"), { recursive: true });
    mkdirSync(join(gitRoot, "ai/skills/keep"), { recursive: true });
    writeFileSync(join(gitRoot, "ai/skills/_foo/marker"), "foo");
    writeFileSync(join(gitRoot, "ai/skills/_bar/marker"), "bar");
    writeFileSync(join(gitRoot, "ai/skills/keep/marker"), "keep");

    handleIgnoredFiles(gitRoot, worktreePath, {
      ignoredFiles: { "ai/skills/_*": "symlink" },
    });

    const fooLink = join(worktreePath, "ai/skills/_foo");
    const barLink = join(worktreePath, "ai/skills/_bar");
    expect(lstatSync(fooLink).isSymbolicLink()).toBe(true);
    expect(lstatSync(barLink).isSymbolicLink()).toBe(true);

    // Symlinks should be relative and resolve to the source
    expect(readlinkSync(fooLink)).toBe("../../../repo/ai/skills/_foo");
    expect(readlinkSync(barLink)).toBe("../../../repo/ai/skills/_bar");

    // Non-matching sibling should not be copied/linked
    expect(existsSync(join(worktreePath, "ai/skills/keep"))).toBe(false);
  });
});
