import React from "react";
import { Box, Text, useInput } from "ink";

type Props = {
  worktreeName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function OpenConfirm({ worktreeName, onConfirm, onCancel }: Props) {
  useInput((input, key) => {
    if (input === "y" || key.return) {
      onConfirm();
    } else if (input === "n" || key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          wt &gt; create
        </Text>
      </Box>
      <Text>
        Created worktree <Text color="green">{worktreeName}</Text>. Open it?{" "}
        <Text dimColor>(y/n)</Text>
      </Text>
    </Box>
  );
}
