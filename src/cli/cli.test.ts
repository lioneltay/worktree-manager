import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(__dirname, "../../dist/cli/index.js");

describe("wt CLI", () => {
  let tempDir: string;
  let run: (cmd: string) => string;
  let runMayFail: (cmd: string) => {
    stdout: string;
    stderr: string;
    status: number;
  };
  let runInDir: (
    dir: string,
    cmd: string,
  ) => { stdout: string; stderr: string; status: number };

  beforeEach(() => {
    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "wt-test-"));

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

    // Base helper to run wt commands in a specific directory
    // Uses spawnSync with shell to handle quoted arguments properly
    runInDir = (dir: string, cmd: string) => {
      const result = spawnSync(`node ${CLI_PATH} ${cmd}`, {
        cwd: dir,
        encoding: "utf-8",
        shell: true,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        status: result.status ?? 1,
      };
    };

    // Helper that doesn't throw on error (runs in tempDir)
    runMayFail = (cmd: string) => runInDir(tempDir, cmd);

    // Helper to run wt commands (throws on error)
    run = (cmd: string) => {
      const result = runMayFail(cmd);
      if (result.status !== 0) {
        throw new Error(
          `Command failed with status ${result.status}: ${result.stdout}${result.stderr}`,
        );
      }
      return result.stdout;
    };
  });

  afterEach(() => {
    // Clean up temp directory and sibling worktrees directory
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(tempDir + ".worktrees", { recursive: true, force: true });
  });

  describe("--help", () => {
    it("shows help message", () => {
      const output = run("--help");
      expect(output).toContain("Git worktree manager");
      expect(output).toContain("init");
      expect(output).toContain("create");
      expect(output).toContain("list");
      expect(output).toContain("remove");
      expect(output).toContain("prune");
    });
  });

  describe("--version", () => {
    it("shows version number", () => {
      const output = run("--version");
      // Version should be a semver-like string
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("outside git repo", () => {
    it("fails with helpful error when not in a git repo", () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), "non-git-"));

      try {
        const { stderr, status } = runInDir(nonGitDir, "init");

        expect(status).toBe(1);
        expect(stderr).toContain("Not in a git repository");
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe("init", () => {
    it("creates worktrees directory and config files", () => {
      const output = run("init");

      expect(output).toContain("Worktree management initialized");
      expect(existsSync(tempDir + ".worktrees")).toBe(true);
      expect(existsSync(join(tempDir, ".wt.json"))).toBe(true);
      expect(existsSync(tempDir + ".worktrees/.metadata.json")).toBe(true);
    });

    it("is idempotent", () => {
      run("init");
      const output = run("init");
      expect(output).toContain("Worktree management initialized");
    });
  });

  describe("create", () => {
    beforeEach(() => {
      run("init");
    });

    it("creates a worktree with new branch", () => {
      const output = run("create -b feature-x");

      expect(output).toContain("Created worktree 'feature-x'");
      expect(existsSync(tempDir + ".worktrees/feature-x")).toBe(true);
    });

    it("converts slashes to double dashes in folder name", () => {
      const output = run("create -b feature/auth/login");

      expect(output).toContain("Created worktree 'feature--auth--login'");
      expect(existsSync(tempDir + ".worktrees/feature--auth--login")).toBe(
        true,
      );
    });

    it("allows custom folder name with --name", () => {
      const output = run("create -b feature/auth/login --name my-auth");

      expect(output).toContain("Created worktree 'my-auth'");
      expect(existsSync(tempDir + ".worktrees/my-auth")).toBe(true);
    });

    it("creates branch from specified base with --from", () => {
      // Create a commit on main
      writeFileSync(join(tempDir, "file.txt"), "content");
      execSync("git add . && git commit -m 'add file'", {
        cwd: tempDir,
        stdio: "pipe",
      });

      run("create -b feature-x --from HEAD~1");

      // The worktree should be at the initial commit, not the latest
      const worktreeHead = execSync("git rev-parse HEAD", {
        cwd: tempDir + ".worktrees/feature-x",
        encoding: "utf-8",
      }).trim();
      const mainHead = execSync("git rev-parse HEAD~1", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      expect(worktreeHead).toBe(mainHead);
    });

    it("checks out existing local branch without -b", () => {
      // Create a branch first
      execSync("git branch existing-branch", { cwd: tempDir, stdio: "pipe" });

      const output = run("create existing-branch");

      expect(output).toContain("Created worktree 'existing-branch'");
    });

    it("fails without -b when branch does not exist", () => {
      const { stderr, status } = runMayFail("create nonexistent-branch");

      expect(status).toBe(1);
      expect(stderr).toContain("not found");
    });

    it("fails when worktree already exists", () => {
      run("create -b feature-x");
      const { stderr, status } = runMayFail("create -b feature-x");

      expect(status).toBe(1);
      expect(stderr).toContain("already exists");
    });

    it("fails when branch is already checked out in main", () => {
      // The main worktree has 'master' or 'main' checked out
      const currentBranch = execSync("git branch --show-current", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      const { status } = runMayFail(`create ${currentBranch}`);

      expect(status).toBe(1);
      // Git will error that the branch is already checked out
    });

    it("rejects path traversal in --name", () => {
      const { stderr, status } = runMayFail(
        "create -b feature-x --name ../evil",
      );

      expect(status).toBe(1);
      expect(stderr).toContain("path traversal");
    });

    it("rejects invalid characters in --name", () => {
      const { stderr, status } = runMayFail(
        "create -b feature-x --name 'foo:bar'",
      );

      expect(status).toBe(1);
      expect(stderr).toContain("invalid characters");
    });

    it("converts slashes in --name to double dashes", () => {
      const output = run("create -b feature-x --name my/custom/name");

      expect(output).toContain("Created worktree 'my--custom--name'");
      expect(existsSync(tempDir + ".worktrees/my--custom--name")).toBe(true);
    });

    it("rejects empty --name", () => {
      const { stderr, status } = runMayFail("create -b feature-x --name ''");

      expect(status).toBe(1);
      expect(stderr).toContain("cannot be empty");
    });

    it("writes metadata file with --meta", () => {
      run('create -b feature-x --meta \'{"task":"do the thing"}\'');

      const metaPath = tempDir + ".worktrees/feature-x/.worktree-meta.json";
      expect(existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      expect(meta.task).toBe("do the thing");
    });

    it("warns on invalid JSON for --meta", () => {
      const { stdout, stderr, status } = runMayFail(
        "create -b feature-x --meta 'not-json'",
      );

      expect(status).toBe(0); // Still succeeds
      expect(stderr).toContain("Warning: Invalid JSON");
      expect(stdout).toContain("Created worktree");
      expect(existsSync(tempDir + ".worktrees/feature-x")).toBe(true);
      // No metadata file since JSON was invalid
      expect(
        existsSync(tempDir + ".worktrees/feature-x/.worktree-meta.json"),
      ).toBe(false);
    });
  });

  describe("create without init", () => {
    it("auto-initializes directory structure when creating first worktree", () => {
      // Don't run init first - worktree creation should still work
      const output = run("create -b feature-x");

      expect(output).toContain("Created worktree 'feature-x'");
      expect(existsSync(tempDir + ".worktrees/feature-x")).toBe(true);
      // .wt.json is only created via explicit `wt init`, not during worktree creation
      expect(existsSync(join(tempDir, ".wt.json"))).toBe(false);
    });
  });

  describe("list", () => {
    beforeEach(() => {
      run("init");
    });

    it("shows empty message when no worktrees", () => {
      const output = run("list");
      expect(output).toContain("No worktrees found");
    });

    it("lists worktrees in table format", () => {
      run("create -b feature-x");
      run("create -b feature-y");

      const output = run("list");

      expect(output).toContain("WORKTREE");
      expect(output).toContain("BRANCH");
      expect(output).toContain("STATUS");
      expect(output).toContain("feature-x");
      expect(output).toContain("feature-y");
    });

    it("outputs JSON with --json flag", () => {
      run("create -b feature-x");

      const output = run("list --json");
      const data = JSON.parse(output);

      expect(data.worktrees).toHaveLength(1);
      expect(data.worktrees[0].name).toBe("feature-x");
      expect(data.worktrees[0].branch).toBe("feature-x");
      expect(data.worktrees[0].status).toBe("clean");
    });

    it("outputs only names with --quiet flag", () => {
      run("create -b feature-x");
      run("create -b feature-y");

      const output = run("list --quiet");

      expect(output.trim()).toBe("feature-x\nfeature-y");
    });

    it("shows modified status when worktree has untracked files", () => {
      run("create -b feature-x");

      // Create an untracked file in the worktree
      writeFileSync(tempDir + ".worktrees/feature-x/newfile.txt", "content");

      const output = run("list --json");
      const data = JSON.parse(output);

      expect(data.worktrees[0].status).toBe("modified");
      expect(data.worktrees[0].untracked).toBe(1);
    });

    it("shows modified status when worktree has staged changes", () => {
      run("create -b feature-x");

      // Create and stage a file
      writeFileSync(tempDir + ".worktrees/feature-x/staged.txt", "content");
      execSync("git add staged.txt", {
        cwd: tempDir + ".worktrees/feature-x",
        stdio: "pipe",
      });

      const output = run("list --json");
      const data = JSON.parse(output);

      expect(data.worktrees[0].status).toBe("modified");
      expect(data.worktrees[0].modified).toBe(1);
    });

    it("shows modified status when worktree has deleted files", () => {
      run("create -b feature-x");
      const worktreePath = tempDir + ".worktrees/feature-x";

      // Create and commit a file
      writeFileSync(join(worktreePath, "to-delete.txt"), "content");
      execSync("git add to-delete.txt && git commit -m 'add file'", {
        cwd: worktreePath,
        stdio: "pipe",
      });

      // Delete the file (unstaged deletion)
      rmSync(join(worktreePath, "to-delete.txt"));

      const output = run("list --json");
      const data = JSON.parse(output);

      expect(data.worktrees[0].status).toBe("modified");
      expect(data.worktrees[0].modified).toBe(1);
    });
  });

  describe("status", () => {
    beforeEach(() => {
      run("init");
      run("create -b feature-x");
    });

    it("shows status of a specific worktree", () => {
      const output = run("status feature-x");

      expect(output).toContain("Worktree: feature-x");
      expect(output).toContain("Branch: feature-x");
      expect(output).toContain("Status:");
    });

    it("outputs JSON with --json flag", () => {
      const output = run("status feature-x --json");
      const data = JSON.parse(output);

      expect(data.name).toBe("feature-x");
      expect(data.branch).toBe("feature-x");
    });

    it("shows all worktrees when no name provided", () => {
      run("create -b feature-y");

      const output = run("status");

      expect(output).toContain("feature-x");
      expect(output).toContain("feature-y");
    });

    it("fails for nonexistent worktree", () => {
      const { stderr, status } = runMayFail("status nonexistent");

      expect(status).toBe(1);
      expect(stderr).toContain("not found");
    });
  });

  describe("remove", () => {
    beforeEach(() => {
      run("init");
    });

    it("removes a worktree", () => {
      run("create -b feature-x");
      const output = run("remove feature-x");

      expect(output).toContain("Removed worktree 'feature-x'");
      expect(existsSync(tempDir + ".worktrees/feature-x")).toBe(false);
    });

    it("fails when worktree has uncommitted changes", () => {
      run("create -b feature-x");
      writeFileSync(tempDir + ".worktrees/feature-x/newfile.txt", "content");
      execSync("git add newfile.txt", {
        cwd: tempDir + ".worktrees/feature-x",
        stdio: "pipe",
      });

      const { stderr, status } = runMayFail("remove feature-x");

      expect(status).toBe(1);
      expect(stderr).toContain("uncommitted changes");
    });

    it("removes with --force despite uncommitted changes", () => {
      run("create -b feature-x");
      writeFileSync(tempDir + ".worktrees/feature-x/newfile.txt", "content");
      execSync("git add newfile.txt", {
        cwd: tempDir + ".worktrees/feature-x",
        stdio: "pipe",
      });

      const output = run("remove feature-x --force");

      expect(output).toContain("Removed worktree 'feature-x'");
    });

    it("fails for nonexistent worktree", () => {
      const { stderr, status } = runMayFail("remove nonexistent");

      expect(status).toBe(1);
      expect(stderr).toContain("not found");
    });

    it("updates registry after removal", () => {
      run("create -b feature-x");
      run("remove feature-x");

      const output = run("list --json");
      const data = JSON.parse(output);

      expect(data.worktrees).toHaveLength(0);
    });
  });

  describe("prune", () => {
    beforeEach(() => {
      run("init");
    });

    it("reports no stale worktrees when none exist", () => {
      const output = run("prune");
      expect(output).toContain("No stale worktrees found");
    });

    it("removes stale entries from registry", () => {
      run("create -b feature-x");

      // Manually delete the worktree directory (simulating corruption)
      rmSync(tempDir + ".worktrees/feature-x", { recursive: true });

      const output = run("prune");

      expect(output).toContain("feature-x");

      // Verify registry is cleaned
      const list = run("list --json");
      expect(JSON.parse(list).worktrees).toHaveLength(0);
    });

    it("shows what would be removed with --dry-run", () => {
      run("create -b feature-x");
      rmSync(tempDir + ".worktrees/feature-x", { recursive: true });

      const output = run("prune --dry-run");

      expect(output).toContain("Would remove");
      expect(output).toContain("feature-x");

      // Registry should NOT be cleaned in dry-run - verify directly
      const metadata = JSON.parse(
        readFileSync(tempDir + ".worktrees/.metadata.json", "utf-8"),
      );
      expect(metadata.worktrees["feature-x"]).toBeDefined();
    });

    it("removes worktrees inactive for specified days with --stale", () => {
      run("create -b old-feature");

      // Manually backdate the createdAt in metadata
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
      metadata.worktrees["old-feature"].createdAt = oldDate.toISOString();
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Prune worktrees older than 5 days
      const output = run("prune --stale 5");

      expect(output).toContain("old-feature");

      // Verify worktree was removed
      expect(existsSync(tempDir + ".worktrees/old-feature")).toBe(false);
    });

    it("keeps worktrees newer than --stale threshold", () => {
      run("create -b new-feature");

      // Prune worktrees older than 5 days (new-feature is brand new)
      const output = run("prune --stale 5");

      expect(output).toContain("No stale worktrees found");
      expect(existsSync(tempDir + ".worktrees/new-feature")).toBe(true);
    });

    it("skips stale worktrees with uncommitted changes", () => {
      run("create -b dirty-feature");

      // Backdate the worktree
      const metadataPath = tempDir + ".worktrees/.metadata.json";
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      metadata.worktrees["dirty-feature"].createdAt = oldDate.toISOString();
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Add uncommitted changes
      writeFileSync(
        tempDir + ".worktrees/dirty-feature/dirty.txt",
        "uncommitted",
      );

      // Prune should skip this worktree
      const output = run("prune --stale 5");

      expect(output).toContain("Skipped");
      expect(output).toContain("dirty-feature");
      expect(output).toContain("uncommitted changes");
      expect(existsSync(tempDir + ".worktrees/dirty-feature")).toBe(true);
    });
  });

  describe("full workflow", () => {
    it("init → create → work → remove cycle", () => {
      // Initialize
      run("init");

      // Create two worktrees
      run("create -b feature-a");
      run("create -b feature-b");

      // Verify both exist
      let list = JSON.parse(run("list --json"));
      expect(list.worktrees).toHaveLength(2);

      // Make changes in feature-a
      writeFileSync(tempDir + ".worktrees/feature-a/work.txt", "work");
      execSync("git add . && git commit -m 'work'", {
        cwd: tempDir + ".worktrees/feature-a",
        stdio: "pipe",
      });

      // Verify status shows clean (changes committed)
      const status = JSON.parse(run("status feature-a --json"));
      expect(status.status).toBe("clean");

      // Remove feature-a
      run("remove feature-a");

      // Verify only feature-b remains
      list = JSON.parse(run("list --json"));
      expect(list.worktrees).toHaveLength(1);
      expect(list.worktrees[0].name).toBe("feature-b");

      // Remove feature-b
      run("remove feature-b");

      // Verify empty
      list = JSON.parse(run("list --json"));
      expect(list.worktrees).toHaveLength(0);
    });
  });
});
