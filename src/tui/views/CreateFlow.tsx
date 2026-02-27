import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { BranchPicker, type Branch } from "../components/BranchPicker.js";
import { create } from "../../core/worktree.js";
import { createGit } from "../../core/git.js";
import { findGitRoot } from "../../utils/paths.js";

type CreatedWorktree = { name: string; path: string; branch: string };

type Props = {
  onDone: (worktree: CreatedWorktree) => void;
  onCancel: () => void;
};

export function CreateFlow({ onDone, onCancel }: Props) {
  const [step, setStep] = useState<"pick-branch" | "pick-base">("pick-branch");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  async function loadBranches() {
    try {
      const gitRoot = findGitRoot();
      if (!gitRoot) return;
      const git = createGit(gitRoot);

      const local = await git.branchLocal();
      const remote = await git.branch(["-r"]);

      const branchList: Branch[] = [];
      for (const name of local.all) {
        branchList.push({ name, source: "local" });
      }
      for (const name of remote.all) {
        // Skip HEAD pointers and already-added local branches
        if (name.includes("/HEAD")) continue;
        const shortName = name.replace(/^origin\//, "");
        if (!local.all.includes(shortName)) {
          branchList.push({ name: shortName, source: "remote" });
        }
      }
      setBranches(branchList);
    } catch {
      // Ignore errors loading branches
    } finally {
      setLoading(false);
    }
  }

  async function createWorktree(
    branch: string,
    opts: { newBranch?: boolean; from?: string },
  ) {
    setCreating(true);
    setError(null);
    try {
      const result = await create(branch, {
        newBranch: opts.newBranch,
        from: opts.from,
      });
      onDone({ ...result, branch });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  if (creating) {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Creating worktree...</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Loading branches...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          wt &gt; create
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {step === "pick-branch" && (
        <BranchPicker
          branches={branches}
          placeholder="type branch name..."
          onSelect={(branch, query) => {
            if (branch) {
              // Existing branch selected
              createWorktree(branch.name, {});
            } else {
              // Create new branch
              setNewBranchName(query);
              setStep("pick-base");
            }
          }}
          onCancel={onCancel}
        />
      )}

      {step === "pick-base" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>
              Creating branch: <Text color="green">{newBranchName}</Text>
            </Text>
          </Box>
          <BranchPicker
            branches={branches}
            placeholder="filter branches..."
            pinnedBranch="main"
            onSelect={(branch, query) => {
              const base = branch?.name ?? query;
              createWorktree(newBranchName, {
                newBranch: true,
                from: base || "main",
              });
            }}
            onCancel={() => setStep("pick-branch")}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          [Enter] select [Esc] {step === "pick-base" ? "back" : "cancel"}
        </Text>
      </Box>
    </Box>
  );
}
