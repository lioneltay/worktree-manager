import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { WorktreeStatus } from "../../types.js";

type Props = {
  worktree: WorktreeStatus;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
};

export function DeleteConfirm({ worktree, onConfirm, onCancel }: Props) {
  const isDirty = worktree.status === "modified";
  const [confirmed, setConfirmed] = useState(false);

  useInput((input, key) => {
    if (confirmed) return;
    if (key.escape || input === "n") {
      onCancel();
      return;
    }
    if (input === "y" && !isDirty) {
      setConfirmed(true);
      onConfirm(false);
      return;
    }
    if (input === "f") {
      setConfirmed(true);
      onConfirm(true);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="red">
          Delete worktree &quot;{worktree.name}&quot;?
        </Text>
      </Box>

      {isDirty && (
        <Box marginBottom={1}>
          <Text color="yellow">
            ⚠ Has uncommitted changes ({worktree.modified} modified,{" "}
            {worktree.untracked} untracked)
          </Text>
        </Box>
      )}

      <Box>
        <Text dimColor>path: {worktree.path}</Text>
      </Box>
      <Box>
        <Text dimColor>branch: {worktree.branch}</Text>
      </Box>

      <Box marginTop={1} gap={2}>
        {!isDirty && (
          <Box>
            <Text color="cyan">[y]</Text>
            <Text> confirm</Text>
          </Box>
        )}
        <Box>
          <Text color="cyan">[f]</Text>
          <Text> force delete</Text>
        </Box>
        <Box>
          <Text color="cyan">[n]</Text>
          <Text> cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
