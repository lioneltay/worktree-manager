import React from "react";
import { Box, Text } from "ink";

type Hotkey = {
  key: string;
  label: string;
};

type Props = {
  hotkeys: Hotkey[];
};

export function HotkeyBar({ hotkeys }: Props) {
  return (
    <Box gap={2}>
      {hotkeys.map((h) => (
        <Box key={h.key}>
          <Text color="cyan">[{h.key}]</Text>
          <Text>{h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
