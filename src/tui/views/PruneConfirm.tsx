import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { prune } from "../../core/worktree.js";

type Props = {
  onDone: () => void;
  onCancel: () => void;
};

export function PruneConfirm({ onDone, onCancel }: Props) {
  const [dryRun, setDryRun] = useState<{
    pruned: string[];
    skipped: { name: string; reason: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pruning, setPruning] = useState(false);

  useEffect(() => {
    runDryRun();
  }, []);

  async function runDryRun() {
    try {
      const result = await prune({ dryRun: true, staleDays: 7 });
      setDryRun(result);
    } catch {
      setDryRun({ pruned: [], skipped: [] });
    } finally {
      setLoading(false);
    }
  }

  useInput((input, key) => {
    if (pruning) return;
    if (key.escape || input === "n") {
      onCancel();
      return;
    }
    if (input === "y" && dryRun && dryRun.pruned.length > 0) {
      doPrune();
      return;
    }
  });

  async function doPrune() {
    setPruning(true);
    try {
      await prune({ staleDays: 7 });
    } catch {
      // Ignore errors
    }
    onDone();
  }

  if (loading) {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Checking for stale worktrees...</Text>
      </Box>
    );
  }

  if (pruning) {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Pruning worktrees...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Prune stale worktrees (&gt;7 days old)
        </Text>
      </Box>

      {dryRun && dryRun.pruned.length === 0 && dryRun.skipped.length === 0 && (
        <Box marginBottom={1}>
          <Text dimColor>No stale worktrees found.</Text>
        </Box>
      )}

      {dryRun && dryRun.pruned.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text>Will remove:</Text>
          {dryRun.pruned.map((name) => (
            <Text key={name} color="red">
              {"  "}- {name}
            </Text>
          ))}
        </Box>
      )}

      {dryRun && dryRun.skipped.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">Skipped (uncommitted changes):</Text>
          {dryRun.skipped.map((s) => (
            <Text key={s.name} color="yellow">
              {"  "}- {s.name}: {s.reason}
            </Text>
          ))}
        </Box>
      )}

      <Box gap={2}>
        {dryRun && dryRun.pruned.length > 0 && (
          <Box>
            <Text color="cyan">[y]</Text>
            <Text> confirm</Text>
          </Box>
        )}
        <Box>
          <Text color="cyan">[n]</Text>
          <Text> cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
