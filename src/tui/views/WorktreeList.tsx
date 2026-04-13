import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import Fuse from "fuse.js";
import { HotkeyBar } from "../components/HotkeyBar.js";
import type { WorktreeStatus } from "../../types.js";

type Props = {
  worktrees: WorktreeStatus[];
  mainWorktree: WorktreeStatus | null;
  loading: boolean;
  fetching: boolean;
  expandedWorktree: string | null;
  expandedStatus: WorktreeStatus | null;
  statusMessage: string | null;
  onOpen: (wt: WorktreeStatus) => void;
  onDelete: (wt: WorktreeStatus) => void;
  onCreate: () => void;
  onPrune: () => void;
  onFetch: () => void;
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
  fetching,
  expandedWorktree,
  expandedStatus,
  statusMessage,
  onOpen,
  onDelete,
  onCreate,
  onPrune,
  onFetch,
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

  // Track terminal size reactively so resizes re-render
  const [termHeight, setTermHeight] = useState(
    () => process.stdout.rows ?? 24,
  );
  useEffect(() => {
    const onResize = () => setTermHeight(process.stdout.rows ?? 24);
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  // Keep header/footer pinned, scroll the worktree list
  const chromeLines = 8 + (statusMessage ? 2 : 0);
  const maxListLines = Math.max(3, termHeight - chromeLines);

  // Scroll offset is sticky: keeps its value across renders so moving within
  // the viewport doesn't cause the visible window to jump around.
  const [scrollOffset, setScrollOffset] = useState(0);

  // The visible range is derived from safeIndex, but may require scrollOffset
  // to change first. We compute the desired offset here and sync via effect.
  const viewportItems = Math.max(1, maxListLines - 2); // reserve ↑ + ↓
  const desiredOffset = useMemo(() => {
    if (displayList.length <= maxListLines) return 0;
    let offset = Math.max(
      0,
      Math.min(scrollOffset, displayList.length - 1),
    );
    if (safeIndex < offset) offset = safeIndex;
    if (safeIndex >= offset + viewportItems) {
      offset = safeIndex - viewportItems + 1;
    }
    return offset;
  }, [safeIndex, displayList.length, maxListLines, viewportItems, scrollOffset]);

  useEffect(() => {
    if (desiredOffset !== scrollOffset) setScrollOffset(desiredOffset);
  }, [desiredOffset, scrollOffset]);

  const scroll = useMemo(() => {
    if (displayList.length === 0) {
      return { start: 0, end: 0, up: false, down: false };
    }
    if (displayList.length <= maxListLines) {
      return {
        start: 0,
        end: displayList.length,
        up: false,
        down: false,
      };
    }
    const end = Math.min(desiredOffset + viewportItems, displayList.length);
    return {
      start: desiredOffset,
      end,
      up: desiredOffset > 0,
      down: end < displayList.length,
    };
  }, [desiredOffset, displayList.length, maxListLines, viewportItems]);

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

    // Use safeIndex (clamped) as the base so navigation works even when
    // selectedIndex has drifted out of range (e.g., after filter shrinks list).
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, safeIndex - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(Math.min(displayList.length - 1, safeIndex + 1));
      return;
    }

    if (!isFiltering) {
      if (input === "/") {
        setIsFiltering(true);
        return;
      }
      if (input === "f") {
        onFetch();
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
      <Box height={termHeight}>
        <Spinner type="dots" />
        <Text> Loading worktrees...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termHeight} overflow="hidden">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          wt
        </Text>
        <Text dimColor> — worktree manager</Text>
        {fetching && (
          <>
            <Text>  </Text>
            <Spinner type="dots" />
            <Text dimColor> fetching</Text>
          </>
        )}
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
        {scroll.up && (
          <Text dimColor>  ↑ {scroll.start} more above</Text>
        )}
        {displayList.slice(scroll.start, scroll.end).map((wt, sliceIdx) => {
          const i = scroll.start + sliceIdx;
          const isSelected = i === safeIndex;
          const isExpanded = expandedWorktree === wt.path;
          const isMain = i < mainWorktreeCount;
          const statusIcon = !wt.statusLoaded ? (
              <Text dimColor>○</Text>
            ) : wt.status === "modified" ? (
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
        {scroll.down && (
          <Text dimColor>  ↓ {displayList.length - scroll.end} more below</Text>
        )}
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
            { key: "f", label: "etch" },
            { key: "/", label: "filter" },
            { key: "q", label: "uit" },
          ]}
        />
      </Box>
    </Box>
  );
}
