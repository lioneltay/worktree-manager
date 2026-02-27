import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import Fuse from "fuse.js";
import { HotkeyBar } from "../components/HotkeyBar.js";
import type { WorktreeStatus } from "../../types.js";

type Props = {
  worktrees: WorktreeStatus[];
  mainWorktree: WorktreeStatus | null;
  loading: boolean;
  expandedWorktree: string | null;
  expandedStatus: WorktreeStatus | null;
  statusMessage: string | null;
  onOpen: (wt: WorktreeStatus) => void;
  onDelete: (wt: WorktreeStatus) => void;
  onCreate: () => void;
  onPrune: () => void;
  onToggleStatus: (wt: WorktreeStatus) => void;
  onQuit: () => void;
};

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function WorktreeList({
  worktrees,
  mainWorktree,
  loading,
  expandedWorktree,
  expandedStatus,
  statusMessage,
  onOpen,
  onDelete,
  onCreate,
  onPrune,
  onToggleStatus,
  onQuit,
}: Props) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFiltering, setIsFiltering] = useState(false);

  const fuse = useMemo(
    () =>
      new Fuse(worktrees, {
        keys: ["name", "branch"],
        threshold: 0.4,
      }),
    [worktrees],
  );

  const filtered = useMemo(() => {
    if (!filter) return worktrees;
    return fuse.search(filter).map((r) => r.item);
  }, [filter, fuse, worktrees]);

  // Combined display list: main worktree pinned at top when not filtering,
  // or included only if it matches the filter
  const displayList = useMemo(() => {
    if (!mainWorktree) return filtered;
    if (!filter) return [mainWorktree, ...filtered];
    // When filtering, only include main worktree if it matches
    const q = filter.toLowerCase();
    const mainMatches =
      mainWorktree.name.toLowerCase().includes(q) ||
      mainWorktree.branch.toLowerCase().includes(q);
    return mainMatches ? [mainWorktree, ...filtered] : filtered;
  }, [mainWorktree, filtered, filter]);

  const mainInList = mainWorktree !== null && displayList[0] === mainWorktree;
  const mainWorktreeCount = mainInList ? 1 : 0;

  // Clamp selectedIndex to valid range when list changes
  const safeIndex = Math.max(
    0,
    Math.min(selectedIndex, displayList.length - 1),
  );
  const selected = displayList.length > 0 ? displayList[safeIndex] : undefined;
  const selectedIsMain = safeIndex < mainWorktreeCount;

  useInput((input, key) => {
    if (key.escape) {
      if (isFiltering) {
        setIsFiltering(false);
        setFilter("");
        return;
      }
      onQuit();
      return;
    }

    if (isFiltering) {
      if (key.return) {
        setIsFiltering(false);
        return;
      }
      if (key.backspace || key.delete) {
        setFilter((f) => f.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (!key.ctrl && !key.meta && input && !key.upArrow && !key.downArrow) {
        setFilter((f) => f + input);
        setSelectedIndex(0);
        return;
      }
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(displayList.length - 1, i + 1));
      return;
    }

    if (!isFiltering) {
      if (input === "/" || input === "f") {
        setIsFiltering(true);
        return;
      }
      if (input === "q") {
        onQuit();
        return;
      }
      if ((input === "o" || key.return) && selected) {
        onOpen(selected);
        return;
      }
      if (input === "d" && selected && !selectedIsMain) {
        onDelete(selected);
        return;
      }
      if (input === "c") {
        onCreate();
        return;
      }
      if (input === "p") {
        onPrune();
        return;
      }
      if ((input === "s" || key.tab) && selected) {
        onToggleStatus(selected);
        return;
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Loading worktrees...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          wt
        </Text>
        <Text dimColor> — worktree manager</Text>
      </Box>

      {/* Filter */}
      <Box>
        <Text dimColor>Filter: </Text>
        {isFiltering ? (
          <Text color="cyan">
            {filter || " "}
            <Text color="cyan">_</Text>
          </Text>
        ) : filter ? (
          <Text>{filter}</Text>
        ) : (
          <Text dimColor>/ to search</Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {displayList.length === 0 && (
          <Text dimColor>
            {worktrees.length === 0
              ? "No worktrees. Press c to create one."
              : "No matches."}
          </Text>
        )}
        {displayList.map((wt, i) => {
          const isSelected = i === safeIndex;
          const isExpanded = expandedWorktree === wt.path;
          const isMain = i < mainWorktreeCount;
          const statusIcon =
            wt.status === "modified" ? (
              <Text color="yellow">●</Text>
            ) : (
              <Text color="green">✓</Text>
            );

          return (
            <Box key={wt.path} flexDirection="column">
              <Box>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? ">" : " "}{" "}
                </Text>
                {statusIcon}
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {" "}
                  {wt.name}
                </Text>
                <Text dimColor>
                  {"  "}
                  {wt.branch}
                </Text>
                {isMain && (
                  <Text dimColor color="blue">
                    {"  "}
                    (main repo)
                  </Text>
                )}
                <Text dimColor>
                  {"  "}
                  {relativeTime(wt.createdAt)}
                </Text>
              </Box>
              {isExpanded && expandedStatus && (
                <Box flexDirection="column" marginLeft={4}>
                  <Text dimColor>├── branch: {expandedStatus.branch}</Text>
                  <Text dimColor>
                    ├── ↑{expandedStatus.ahead} ↓{expandedStatus.behind}
                  </Text>
                  <Text dimColor>
                    └── {expandedStatus.modified} modified,{" "}
                    {expandedStatus.untracked} untracked
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{worktrees.length} worktrees</Text>
      </Box>

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <HotkeyBar
          hotkeys={[
            { key: "o", label: "pen" },
            { key: "c", label: "reate" },
            { key: "d", label: "elete" },
            { key: "s", label: "tatus" },
            { key: "p", label: "rune" },
            { key: "/", label: "filter" },
            { key: "q", label: "uit" },
          ]}
        />
      </Box>
    </Box>
  );
}
