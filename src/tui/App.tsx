import { useState, useEffect, useMemo, useRef } from "react";
import { Text, useApp } from "ink";
import { spawn, execSync } from "node:child_process";
import { WorktreeList } from "./views/WorktreeList.js";
import { CreateFlow } from "./views/CreateFlow.js";
import { DeleteConfirm } from "./views/DeleteConfirm.js";
import { OpenConfirm } from "./views/OpenConfirm.js";
import { PruneConfirm } from "./views/PruneConfirm.js";
import {
  listAll,
  enrichAllWorktrees,
  status,
  remove,
} from "../core/worktree.js";
import { createGit } from "../core/git.js";
import { loadConfig } from "../core/config.js";
import { findGitRoot } from "../utils/paths.js";
import type { WorktreeStatus, WtConfig } from "../types.js";

type View =
  | { type: "list" }
  | { type: "create" }
  | { type: "confirm-open"; worktree: { name: string; path: string; branch: string } }
  | { type: "delete"; worktree: WorktreeStatus }
  | { type: "prune" };

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>({ type: "list" });
  const [worktrees, setWorktrees] = useState<WorktreeStatus[]>([]);
  const [mainWorktree, setMainWorktree] = useState<WorktreeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<WtConfig>({});
  const [expandedWorktree, setExpandedWorktree] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<WorktreeStatus | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const gitRoot = useMemo(() => findGitRoot(), []);
  const refreshGenRef = useRef(0);
  const statusRequestRef = useRef(0);

  const openWorktree = (wt: { path: string; branch: string }): boolean => {
    if (!config.open) return false;
    const hasTemplate =
      config.open.includes("{{path}}") ||
      config.open.includes("{{branch}}");
    if (hasTemplate) {
      const cmd = config.open
        .replaceAll("{{path}}", wt.path)
        .replaceAll("{{branch}}", wt.branch);
      try {
        execSync(cmd, { stdio: "ignore", shell: "/bin/bash" });
      } catch {
        setStatusMessage(`Failed to run: ${cmd}`);
        return false;
      }
    } else {
      const child = spawn(config.open, [wt.path], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {});
      child.unref();
    }
    return true;
  };

  /**
   * Load worktrees in two phases: show basic list instantly, then enrich with
   * git status in the background. Optionally fetch from remote between phases
   * so enrichment picks up fresh ahead/behind counts.
   */
  const refreshWorktrees = async ({ fetchFirst = false } = {}) => {
    if (!gitRoot) return;
    const gen = ++refreshGenRef.current;
    const isStale = () => refreshGenRef.current !== gen;

    try {
      setError(null);

      const { main, worktrees: wts } = await listAll(gitRoot);
      if (isStale()) return;
      setWorktrees(wts);
      setMainWorktree(main);
      setLoading(false);

      if (fetchFirst) {
        try {
          await createGit(gitRoot).fetch();
        } catch {
          // Non-fatal — enrichment still runs with stale remote data
        }
        if (isStale()) return;
      }

      const enriched = await enrichAllWorktrees(main ? [main, ...wts] : wts);
      if (isStale()) return;

      if (main) {
        const [enrichedMain, ...enrichedWts] = enriched;
        setMainWorktree(enrichedMain ?? null);
        setWorktrees(enrichedWts);
      } else {
        setWorktrees(enriched);
      }
    } catch (e) {
      if (isStale()) return;
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  const fetchRemote = async ({ silent = false } = {}) => {
    if (!gitRoot || fetching) return;
    setFetching(true);
    if (!silent) setStatusMessage("Fetching...");
    try {
      await createGit(gitRoot).fetch();
      if (!silent) setStatusMessage("Fetched latest from remote");
      await refreshWorktrees();
    } catch {
      if (!silent) setStatusMessage("Fetch failed");
    } finally {
      setFetching(false);
    }
  };

  const toggleStatus = async (wt: WorktreeStatus) => {
    if (expandedWorktree === wt.path) {
      setExpandedWorktree(null);
      setExpandedStatus(null);
    } else {
      const requestId = ++statusRequestRef.current;
      setExpandedWorktree(wt.path);
      setExpandedStatus(null);
      const s = await status(wt.name, { path: wt.path });
      if (statusRequestRef.current === requestId) {
        setExpandedStatus(s);
      }
    }
  };

  useEffect(() => {
    if (!gitRoot) return;
    setConfig(loadConfig(gitRoot));
    refreshWorktrees({ fetchFirst: true });
    // Bump the generation counter on unmount so any in-flight async work
    // drops its results instead of updating state on an unmounted component.
    return () => {
      refreshGenRef.current++;
    };
  }, []);

  if (!gitRoot) {
    return <Text color="red">Not in a git repository</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  switch (view.type) {
    case "list":
      return (
        <WorktreeList
          worktrees={worktrees}
          mainWorktree={mainWorktree}
          loading={loading}
          fetching={fetching}
          expandedWorktree={expandedWorktree}
          expandedStatus={expandedStatus}
          statusMessage={statusMessage}
          onOpen={(wt) => {
            if (!openWorktree(wt)) {
              setStatusMessage(`Path: ${wt.path}`);
            }
          }}
          onDelete={(wt) => setView({ type: "delete", worktree: wt })}
          onCreate={() => setView({ type: "create" })}
          onPrune={() => setView({ type: "prune" })}
          onFetch={() => fetchRemote()}
          onToggleStatus={toggleStatus}
          onQuit={() => exit()}
        />
      );
    case "create":
      return (
        <CreateFlow
          onDone={(worktree) => {
            refreshWorktrees();
            if (config.open) {
              setView({ type: "confirm-open", worktree });
            } else {
              setView({ type: "list" });
            }
          }}
          onCancel={() => setView({ type: "list" })}
        />
      );
    case "confirm-open":
      return (
        <OpenConfirm
          worktreeName={view.worktree.name}
          onConfirm={() => {
            openWorktree({ path: view.worktree.path, branch: view.worktree.branch });
            exit();
          }}
          onCancel={() => setView({ type: "list" })}
        />
      );
    case "delete":
      return (
        <DeleteConfirm
          worktree={view.worktree}
          onConfirm={async (force) => {
            setWorktrees((prev) =>
              prev.filter((w) => w.name !== view.worktree.name),
            );
            setView({ type: "list" });
            try {
              await remove(view.worktree.name, {
                force,
                path: view.worktree.path,
              });
            } catch {
              setStatusMessage("Delete failed — worktree restored");
              await refreshWorktrees();
            }
          }}
          onCancel={() => setView({ type: "list" })}
        />
      );
    case "prune":
      return (
        <PruneConfirm
          onDone={() => {
            refreshWorktrees();
            setView({ type: "list" });
          }}
          onCancel={() => setView({ type: "list" })}
        />
      );
  }
}
