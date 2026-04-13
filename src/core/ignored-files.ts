import * as fs from "node:fs";
import * as path from "node:path";
import type { WtConfig, IgnoredFileMode } from "../types.js";

/**
 * Handle ignored files when creating a worktree
 */
export function handleIgnoredFiles(
  gitRoot: string,
  worktreePath: string,
  config: WtConfig,
  options: { copyAll?: boolean; noIgnored?: boolean } = {},
): void {
  if (options.noIgnored) {
    return;
  }

  const entries = expandIgnoredFiles(gitRoot, config.ignoredFiles ?? {});

  for (const [filePath, mode] of entries) {
    const sourcePath = path.join(gitRoot, filePath);
    const targetPath = path.join(worktreePath, filePath);

    // Skip if source doesn't exist
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    // Determine effective mode
    const effectiveMode: IgnoredFileMode = options.copyAll ? "copy" : mode;

    if (effectiveMode === "ignore") {
      continue;
    }

    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (effectiveMode === "symlink") {
      createSymlink(sourcePath, targetPath);
    } else if (effectiveMode === "copy") {
      copyFileOrDir(sourcePath, targetPath);
    }
  }
}

/**
 * Expand glob patterns in ignoredFiles keys into concrete paths.
 * Supports `*` and `?` within a path segment (e.g. `ai/skills/_*`).
 * Non-glob keys pass through unchanged.
 */
export function expandIgnoredFiles(
  gitRoot: string,
  ignoredFiles: Record<string, IgnoredFileMode>,
): Array<[string, IgnoredFileMode]> {
  const result: Array<[string, IgnoredFileMode]> = [];
  for (const [pattern, mode] of Object.entries(ignoredFiles)) {
    if (!isGlobPattern(pattern)) {
      result.push([pattern, mode]);
      continue;
    }
    for (const match of expandGlob(gitRoot, pattern)) {
      result.push([match, mode]);
    }
  }
  return result;
}

function isGlobPattern(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

function globSegmentToRegex(segment: string): RegExp {
  let source = "^";
  for (const char of segment) {
    if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source);
}

/**
 * Expand a glob pattern relative to gitRoot into matching paths.
 * Walks the filesystem segment-by-segment; returns paths relative to gitRoot.
 */
function expandGlob(gitRoot: string, pattern: string): string[] {
  const segments = pattern.split("/").filter((s) => s.length > 0);
  const results: string[] = [];

  const walk = (currentRel: string, index: number): void => {
    if (index === segments.length) {
      if (currentRel) results.push(currentRel);
      return;
    }
    const segment = segments[index];
    if (segment === undefined) return;
    if (!isGlobPattern(segment)) {
      walk(currentRel ? `${currentRel}/${segment}` : segment, index + 1);
      return;
    }
    const absDir = path.join(gitRoot, currentRel);
    let entries: string[];
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      return;
    }
    const regex = globSegmentToRegex(segment);
    for (const entry of entries) {
      if (regex.test(entry)) {
        walk(currentRel ? `${currentRel}/${entry}` : entry, index + 1);
      }
    }
  };

  walk("", 0);
  return results;
}

/**
 * Check if anything exists at the given path (including broken symlinks).
 * Unlike fs.existsSync, this uses lstat to check the path itself, not what it points to.
 */
function pathExists(filepath: string): boolean {
  try {
    fs.lstatSync(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a relative symlink
 */
function createSymlink(sourcePath: string, targetPath: string): void {
  // Remove trailing slashes - symlinkSync fails with ENOENT if target has trailing slash
  const cleanTargetPath = targetPath.replace(/\/+$/, "");
  const cleanSourcePath = sourcePath.replace(/\/+$/, "");

  // Calculate relative path from target to source
  const relativePath = path.relative(
    path.dirname(cleanTargetPath),
    cleanSourcePath,
  );

  // Remove target if it exists (including broken symlinks)
  // Note: fs.existsSync returns false for broken symlinks, so use lstat instead
  if (pathExists(cleanTargetPath)) {
    fs.rmSync(cleanTargetPath, { recursive: true, force: true });
  }

  fs.symlinkSync(relativePath, cleanTargetPath);
}

/**
 * Copy a file or directory
 */
function copyFileOrDir(sourcePath: string, targetPath: string): void {
  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
}
