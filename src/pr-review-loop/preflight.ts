/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import type { PreflightResult } from './types';

import {
  formatGhAuthHelp,
  formatGhPermissionHelp,
  isLikelyGhAuthOrPermissionIssue,
} from './gh-errors';

/**
 * Run ordered preflight checks before starting the PR review loop.
 *
 * Performs 8 ordered validation checks in sequence:
 * 1. GitHub CLI authentication status
 * 2. Git repository presence
 * 3. Clean working tree (no uncommitted changes)
 * 4. Current branch (not in detached HEAD state)
 * 5. Repository owner/name metadata
 * 6. dx command availability
 * 7. dx lint subcommand exists
 * 8. dx build subcommand exists
 *
 * Fails immediately (fail-fast) on the first check that fails.
 *
 * @param $ - Bun shell instance for running commands
 * @param directory - Working directory (for context, not currently used)
 * @returns PreflightResult with success status and extracted metadata
 *
 * @example
 * ```typescript
 * const result = await runPreflightChecks($, process.cwd());
 * if (!result.success) {
 *   throw new Error(result.error);
 * }
 * // Use result.currentBranch, result.repoOwner, result.repoName
 * ```
 */
export async function runPreflightChecks($: any, directory: string): Promise<PreflightResult> {
  // Check 1: GitHub CLI authentication
  try {
    await $`gh auth status`.quiet();
  } catch (error) {
    return {
      success: false,
      error: formatGhAuthHelp(error),
    };
  }

  // Check 2: Git repository presence
  try {
    const isRepo = await $`git rev-parse --is-inside-work-tree`.text();
    if (isRepo.trim() !== 'true') {
      return {
        success: false,
        error: 'Not in a git repository',
      };
    }
  } catch {
    return {
      success: false,
      error: 'Not in a git repository',
    };
  }

  // Check 3: Clean working tree
  try {
    const status = await $`git status --porcelain`.text();
    if (status.trim() !== '') {
      return {
        success: false,
        error: 'Working tree is dirty. Commit or stash changes first',
      };
    }
  } catch {
    return {
      success: false,
      error: 'Working tree is dirty. Commit or stash changes first',
    };
  }

  // Check 4: Current branch (not detached HEAD)
  let currentBranch: string;
  try {
    currentBranch = await $`git branch --show-current`.text();
    currentBranch = currentBranch.trim();
    if (currentBranch === '') {
      return {
        success: false,
        error: 'Not on a branch (detached HEAD)',
      };
    }
  } catch {
    return {
      success: false,
      error: 'Not on a branch (detached HEAD)',
    };
  }

  // Check 5: Repository owner and name
  let repoOwner: string;
  let repoName: string;
  try {
    const nameWithOwner = await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text();
    const trimmed = nameWithOwner.trim();
    const parts = trimmed.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        success: false,
        error: 'Cannot determine repository owner/name',
      };
    }
    repoOwner = parts[0];
    repoName = parts[1];
  } catch (error) {
    if (isLikelyGhAuthOrPermissionIssue(error)) {
      return {
        success: false,
        error: formatGhPermissionHelp('读取仓库信息失败（gh repo view）', error),
      };
    }
    return {
      success: false,
      error: 'Cannot determine repository owner/name',
    };
  }

  // Check 6: dx command exists
  try {
    await $`command -v dx`.quiet();
  } catch {
    return {
      success: false,
      error: 'dx command not found. Install dx CLI first',
    };
  }

  // Check 7: dx lint subcommand exists
  try {
    const dxHelp = await $`dx --help`.text();
    if (!dxHelp.includes('lint')) {
      return {
        success: false,
        error: 'dx subcommand missing: need dx lint',
      };
    }
  } catch {
    return {
      success: false,
      error: 'dx subcommand missing: need dx lint',
    };
  }

  // Check 8: dx build subcommand exists
  try {
    const dxHelp = await $`dx --help`.text();
    if (!dxHelp.includes('build')) {
      return {
        success: false,
        error: 'dx subcommand missing: need dx build',
      };
    }
  } catch {
    return {
      success: false,
      error: 'dx subcommand missing: need dx build',
    };
  }

  // All checks passed
  return {
    success: true,
    currentBranch,
    repoOwner,
    repoName,
  };
}
