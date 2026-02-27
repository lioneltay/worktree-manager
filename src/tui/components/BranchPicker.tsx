import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Fuse from "fuse.js";

export type Branch = {
  name: string;
  source: "local" | "remote";
};

type Props = {
  branches: Branch[];
  placeholder?: string;
  pinnedBranch?: string;
  onSelect: (branch: Branch | null, query: string) => void;
  onCancel: () => void;
};

const MAX_VISIBLE = 10;

export function BranchPicker({
  branches,
  placeholder,
  pinnedBranch,
  onSelect,
  onCancel,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sortedBranches = useMemo(() => {
    if (!pinnedBranch) return branches;
    const pinned = branches.filter((b) => b.name === pinnedBranch);
    const rest = branches.filter((b) => b.name !== pinnedBranch);
    return [...pinned, ...rest];
  }, [branches, pinnedBranch]);

  const fuse = useMemo(
    () => new Fuse(sortedBranches, { keys: ["name"], threshold: 0.4 }),
    [sortedBranches],
  );

  const filtered = useMemo(() => {
    if (!query) return sortedBranches;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse, sortedBranches]);

  const hasExactMatch = filtered.some(
    (b) => b.name.toLowerCase() === query.toLowerCase(),
  );
  const showCreateOption = query.length > 0 && !hasExactMatch;
  const totalItems = filtered.length + (showCreateOption ? 1 : 0);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Clamp selectedIndex
  const safeIndex =
    totalItems > 0 ? Math.min(selectedIndex, totalItems - 1) : 0;

  // Scrolling window for branches
  const scrollOffset = Math.max(0, safeIndex - MAX_VISIBLE + 1);
  const visibleBranches = filtered.slice(
    scrollOffset,
    scrollOffset + MAX_VISIBLE,
  );

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(totalItems - 1, i + 1));
      return;
    }
    if (key.return) {
      if (totalItems === 0) return;
      if (safeIndex < filtered.length) {
        const branch = filtered[safeIndex];
        if (branch) onSelect(branch, query);
      } else if (showCreateOption) {
        onSelect(null, query);
      }
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text>Branch: </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder={placeholder ?? "type to filter..."}
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {scrollOffset > 0 && <Text dimColor> ↑ {scrollOffset} more</Text>}
        {visibleBranches.map((branch, i) => {
          const realIndex = i + scrollOffset;
          return (
            <Box key={branch.name} gap={2}>
              <Text color={realIndex === safeIndex ? "cyan" : undefined}>
                {realIndex === safeIndex ? ">" : " "} {branch.name}
              </Text>
              <Text dimColor>({branch.source})</Text>
            </Box>
          );
        })}
        {scrollOffset + MAX_VISIBLE < filtered.length && (
          <Text dimColor>
            {" "}
            ↓ {filtered.length - scrollOffset - MAX_VISIBLE} more
          </Text>
        )}
        {showCreateOption && (
          <>
            <Text dimColor>{"  ─────────────────────────────"}</Text>
            <Text color={safeIndex === filtered.length ? "cyan" : "green"}>
              {safeIndex === filtered.length ? ">" : " "} + Create new branch "
              {query}"
            </Text>
          </>
        )}
        {totalItems === 0 && <Text dimColor>No branches found</Text>}
      </Box>
    </Box>
  );
}
