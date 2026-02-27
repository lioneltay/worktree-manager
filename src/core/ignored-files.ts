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

  const ignoredFiles = config.ignoredFiles ?? {};

  for (const [filePath, mode] of Object.entries(ignoredFiles)) {
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
