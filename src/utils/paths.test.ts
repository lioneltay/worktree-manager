import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateWorktreeName,
  branchToFolderName,
  findGitRoot,
  getWorktreesDir,
  getWorktreePath,
  getConfigPath,
  getMetadataPath,
} from "./paths.js";

describe("validateWorktreeName", () => {
  it("accepts valid names", () => {
    expect(() => validateWorktreeName("feature-x")).not.toThrow();
    expect(() => validateWorktreeName("my-worktree")).not.toThrow();
    expect(() => validateWorktreeName("feature--auth--login")).not.toThrow();
    expect(() => validateWorktreeName("123")).not.toThrow();
  });

  it("rejects empty names", () => {
    expect(() => validateWorktreeName("")).toThrow("cannot be empty");
    expect(() => validateWorktreeName("   ")).toThrow("cannot be empty");
  });

  it("rejects path traversal", () => {
    expect(() => validateWorktreeName("..")).toThrow("path traversal");
    expect(() => validateWorktreeName("../evil")).toThrow("path traversal");
    expect(() => validateWorktreeName("foo/../bar")).toThrow("path traversal");
    expect(() => validateWorktreeName("foo/..")).toThrow("path traversal");
  });

  it("rejects Windows-invalid characters", () => {
    expect(() => validateWorktreeName("foo:bar")).toThrow("invalid characters");
    expect(() => validateWorktreeName("foo<bar")).toThrow("invalid characters");
    expect(() => validateWorktreeName("foo>bar")).toThrow("invalid characters");
    expect(() => validateWorktreeName("foo?bar")).toThrow("invalid characters");
    expect(() => validateWorktreeName("foo*bar")).toThrow("invalid characters");
    expect(() => validateWorktreeName("foo|bar")).toThrow("invalid characters");
  });

  it("allows slashes (they get converted elsewhere)", () => {
    // Slashes are converted to -- by branchToFolderName or create command
    // validateWorktreeName is called after conversion
    expect(() => validateWorktreeName("foo/bar")).not.toThrow();
  });
});

describe("branchToFolderName", () => {
  it("keeps simple branch names unchanged", () => {
    expect(branchToFolderName("main")).toBe("main");
    expect(branchToFolderName("feature-x")).toBe("feature-x");
  });

  it("removes origin/ prefix", () => {
    expect(branchToFolderName("origin/main")).toBe("main");
    expect(branchToFolderName("origin/feature/auth")).toBe("feature--auth");
  });

  it("converts forward slashes to double dashes", () => {
    expect(branchToFolderName("feature/auth")).toBe("feature--auth");
    expect(branchToFolderName("feature/auth/login")).toBe(
      "feature--auth--login",
    );
  });

  it("converts backslashes to double dashes", () => {
    expect(branchToFolderName("feature\\auth")).toBe("feature--auth");
    expect(branchToFolderName("feature\\auth\\login")).toBe(
      "feature--auth--login",
    );
  });

  it("handles mixed slashes", () => {
    expect(branchToFolderName("feature/auth\\login")).toBe(
      "feature--auth--login",
    );
  });
});

describe("findGitRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "wt-paths-test-")));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-git directory", () => {
    expect(findGitRoot(tempDir)).toBeNull();
  });

  it("returns repo root for git repository", () => {
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    expect(findGitRoot(tempDir)).toBe(tempDir);
  });

  it("returns repo root from subdirectory", () => {
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    const subDir = join(tempDir, "sub", "deep");
    execSync(`mkdir -p "${subDir}"`, { stdio: "pipe" });

    expect(findGitRoot(subDir)).toBe(tempDir);
  });

  it("uses process.cwd() as default", () => {
    const originalCwd = process.cwd();
    try {
      execSync("git init", { cwd: tempDir, stdio: "pipe" });
      process.chdir(tempDir);
      expect(findGitRoot()).toBe(tempDir);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("path utility functions", () => {
  const gitRoot = "/fake/repo";

  it("getWorktreesDir returns sibling companion directory", () => {
    expect(getWorktreesDir(gitRoot)).toBe("/fake/repo.worktrees");
  });

  it("getWorktreePath returns path to specific worktree", () => {
    expect(getWorktreePath(gitRoot, "feature-x")).toBe(
      "/fake/repo.worktrees/feature-x",
    );
  });

  it("getConfigPath returns path to .wt.json", () => {
    expect(getConfigPath(gitRoot)).toBe("/fake/repo/.wt.json");
  });

  it("getMetadataPath returns path to metadata registry", () => {
    expect(getMetadataPath(gitRoot)).toBe(
      "/fake/repo.worktrees/.metadata.json",
    );
  });
});
