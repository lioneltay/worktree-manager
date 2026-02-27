import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGit,
  localBranchExists,
  remoteBranchExists,
  listGitWorktrees,
  addWorktree,
  addWorktreeNewBranch,
  removeWorktree,
  getWorktreeStatus,
  getAheadBehind,
} from "./git.js";

describe("git", () => {
  let tempDir: string;

  beforeEach(() => {
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "wt-git-test-")));

    // Initialize git repo with initial commit
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", {
      cwd: tempDir,
      stdio: "pipe",
    });
    execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
    execSync("git commit --allow-empty -m 'initial commit'", {
      cwd: tempDir,
      stdio: "pipe",
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(tempDir + ".worktrees", { recursive: true, force: true });
  });

  describe("createGit", () => {
    it("creates a simple-git instance", () => {
      const git = createGit(tempDir);
      expect(git).toBeDefined();
    });
  });

  describe("localBranchExists", () => {
    it("returns true for existing branch", async () => {
      const git = createGit(tempDir);
      // Default branch (main or master) should exist
      const currentBranch = execSync("git branch --show-current", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      const exists = await localBranchExists(git, currentBranch);
      expect(exists).toBe(true);
    });

    it("returns true for created branch", async () => {
      const git = createGit(tempDir);
      execSync("git branch feature-x", { cwd: tempDir, stdio: "pipe" });

      const exists = await localBranchExists(git, "feature-x");
      expect(exists).toBe(true);
    });

    it("returns false for non-existent branch", async () => {
      const git = createGit(tempDir);
      const exists = await localBranchExists(git, "nonexistent-branch");
      expect(exists).toBe(false);
    });
  });

  describe("remoteBranchExists", () => {
    it("returns false when no remote exists", async () => {
      const git = createGit(tempDir);
      const exists = await remoteBranchExists(git, "main");
      expect(exists).toBe(false);
    });
  });

  describe("listGitWorktrees", () => {
    it("lists main worktree", async () => {
      const git = createGit(tempDir);
      const worktrees = await listGitWorktrees(git);

      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      const mainWorktree = worktrees[0];
      expect(mainWorktree).toBeDefined();
      expect(mainWorktree!.path).toBe(tempDir);
      expect(mainWorktree!.head).toBeDefined();
    });

    it("lists added worktrees", async () => {
      const git = createGit(tempDir);
      const worktreePath = join(tempDir + ".worktrees", "feature-x");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });
      execSync(`git worktree add "${worktreePath}" -b feature-x`, {
        cwd: tempDir,
        stdio: "pipe",
      });

      const worktrees = await listGitWorktrees(git);
      expect(worktrees.length).toBe(2);

      const featureWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(featureWorktree).toBeDefined();
      expect(featureWorktree?.branch).toBe("feature-x");
    });

    it("handles detached HEAD worktrees", async () => {
      const git = createGit(tempDir);
      const worktreePath = join(tempDir + ".worktrees", "detached");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });

      // Get current commit hash for detached HEAD
      const commitHash = execSync("git rev-parse HEAD", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      execSync(`git worktree add --detach "${worktreePath}" ${commitHash}`, {
        cwd: tempDir,
        stdio: "pipe",
      });

      const worktrees = await listGitWorktrees(git);
      const detachedWorktree = worktrees.find((wt) => wt.path === worktreePath);

      expect(detachedWorktree).toBeDefined();
      expect(detachedWorktree?.branch).toBeNull();
    });
  });

  describe("addWorktree", () => {
    it("adds worktree for existing branch", async () => {
      const git = createGit(tempDir);
      execSync("git branch existing-branch", { cwd: tempDir, stdio: "pipe" });

      const worktreePath = join(tempDir + ".worktrees", "existing");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });

      await addWorktree(git, worktreePath, "existing-branch");

      const worktrees = await listGitWorktrees(git);
      const addedWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(addedWorktree).toBeDefined();
      expect(addedWorktree?.branch).toBe("existing-branch");
    });
  });

  describe("addWorktreeNewBranch", () => {
    it("creates new branch and worktree", async () => {
      const git = createGit(tempDir);
      const worktreePath = join(tempDir + ".worktrees", "new-feature");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });

      await addWorktreeNewBranch(git, worktreePath, "new-feature");

      const worktrees = await listGitWorktrees(git);
      const newWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(newWorktree).toBeDefined();
      expect(newWorktree?.branch).toBe("new-feature");
    });

    it("creates branch from specified base", async () => {
      const git = createGit(tempDir);

      // Create a commit so we have a history
      writeFileSync(join(tempDir, "file.txt"), "content");
      execSync("git add . && git commit -m 'add file'", {
        cwd: tempDir,
        stdio: "pipe",
      });

      const worktreePath = join(tempDir + ".worktrees", "from-base");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });

      await addWorktreeNewBranch(git, worktreePath, "from-base", "HEAD~1");

      // Verify the worktree is at the old commit
      const worktreeHead = execSync("git rev-parse HEAD", {
        cwd: worktreePath,
        encoding: "utf-8",
      }).trim();
      const baseHead = execSync("git rev-parse HEAD~1", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      expect(worktreeHead).toBe(baseHead);
    });
  });

  describe("removeWorktree", () => {
    it("removes worktree", async () => {
      const git = createGit(tempDir);
      const worktreePath = join(tempDir + ".worktrees", "to-remove");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });
      execSync(`git worktree add "${worktreePath}" -b to-remove`, {
        cwd: tempDir,
        stdio: "pipe",
      });

      await removeWorktree(git, worktreePath);

      const worktrees = await listGitWorktrees(git);
      const removedWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(removedWorktree).toBeUndefined();
    });

    it("removes worktree with force flag", async () => {
      const git = createGit(tempDir);
      const worktreePath = join(tempDir + ".worktrees", "dirty");
      execSync(`mkdir -p "${tempDir}.worktrees"`, { stdio: "pipe" });
      execSync(`git worktree add "${worktreePath}" -b dirty`, {
        cwd: tempDir,
        stdio: "pipe",
      });

      // Add uncommitted changes
      writeFileSync(join(worktreePath, "dirty.txt"), "uncommitted");

      await removeWorktree(git, worktreePath, true);

      const worktrees = await listGitWorktrees(git);
      const removedWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(removedWorktree).toBeUndefined();
    });
  });

  describe("getWorktreeStatus", () => {
    it("returns clean status for unchanged worktree", async () => {
      const status = await getWorktreeStatus(tempDir);
      expect(status.modified).toBe(0);
      expect(status.untracked).toBe(0);
    });

    it("counts untracked files", async () => {
      writeFileSync(join(tempDir, "untracked.txt"), "content");

      const status = await getWorktreeStatus(tempDir);
      expect(status.untracked).toBe(1);
      expect(status.modified).toBe(0);
    });

    it("counts modified files", async () => {
      // Create and commit a file
      writeFileSync(join(tempDir, "tracked.txt"), "original");
      execSync("git add tracked.txt && git commit -m 'add file'", {
        cwd: tempDir,
        stdio: "pipe",
      });

      // Modify the file
      writeFileSync(join(tempDir, "tracked.txt"), "modified");

      const status = await getWorktreeStatus(tempDir);
      expect(status.modified).toBe(1);
    });

    it("counts staged files as modified", async () => {
      writeFileSync(join(tempDir, "staged.txt"), "content");
      execSync("git add staged.txt", { cwd: tempDir, stdio: "pipe" });

      const status = await getWorktreeStatus(tempDir);
      expect(status.modified).toBe(1);
    });

    it("counts deleted files as modified", async () => {
      writeFileSync(join(tempDir, "to-delete.txt"), "content");
      execSync("git add to-delete.txt && git commit -m 'add file'", {
        cwd: tempDir,
        stdio: "pipe",
      });

      rmSync(join(tempDir, "to-delete.txt"));

      const status = await getWorktreeStatus(tempDir);
      expect(status.modified).toBe(1);
    });

    it("accepts existing git instance", async () => {
      const git = createGit(tempDir);
      const status = await getWorktreeStatus(tempDir, git);
      expect(status.modified).toBe(0);
      expect(status.untracked).toBe(0);
    });
  });

  describe("getAheadBehind", () => {
    it("returns zeros when no upstream", async () => {
      const git = createGit(tempDir);
      const currentBranch = execSync("git branch --show-current", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      const result = await getAheadBehind(git, currentBranch);
      expect(result).toEqual({ ahead: 0, behind: 0 });
    });
  });
});
