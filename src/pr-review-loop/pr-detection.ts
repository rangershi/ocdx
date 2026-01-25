/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PRInfo } from './types';

/**
 * Detect and gather full metadata for a Pull Request
 *
 * This function implements a 9-step process to identify a PR and collect all required metadata:
 * 1. Determine PR number (from argument or auto-detect from current branch)
 * 2. Validate PR state (reject if closed/merged)
 * 3. Check branch match (if auto-detected)
 * 4. Gather PR metadata (title, URL, base/head refs, state)
 * 5. Get file list
 * 6. Get diff (with truncation if >4000 lines or >200K chars)
 * 7. Detect fork / push permission via GraphQL
 * 8. Compute review state (detect CHANGES_REQUESTED from maintainers)
 * 9. Return complete PRInfo object
 *
 * @param $ - Bun shell API instance for running commands
 * @param prArg - Optional explicit PR number (from --pr flag)
 * @param currentBranch - Current git branch name
 * @param repoOwner - Repository owner (org or user)
 * @param repoName - Repository name
 * @returns Complete PR metadata including diff, files, and review state
 * @throws Error if PR not found, multiple PRs found, or PR is closed/merged
 *
 * @example
 * ```typescript
 * const prInfo = await detectPR($, 123, 'main', 'owner', 'repo');
 * const prInfo = await detectPR($, undefined, 'feature-branch', 'owner', 'repo');
 * ```
 */
export async function detectPR(
  $: any,
  prArg: number | undefined,
  currentBranch: string,
  repoOwner: string,
  repoName: string
): Promise<PRInfo> {
  let prNumber: number;

  // Step 1: Determine PR number
  if (prArg !== undefined) {
    prNumber = prArg;
  } else {
    // Auto-detect from current branch
    try {
      const listOutput = await $`gh pr list --head ${currentBranch} --json number,title,url`.text();
      const prs = JSON.parse(listOutput);

      if (prs.length === 0) {
        throw new Error(`No PR found for branch: ${currentBranch}`);
      }

      if (prs.length > 1) {
        const prList = prs.map((pr: any) => `#${pr.number}: ${pr.title}`).join(', ');
        throw new Error(
          `Multiple PRs found for branch ${currentBranch}: ${prList}. Use --pr flag to specify`
        );
      }

      prNumber = prs[0].number;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('No PR found')) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith('Multiple PRs found')) {
        throw error;
      }
      throw new Error(`Failed to list PRs for branch ${currentBranch}: ${error}`);
    }
  }

  // Step 2: Validate PR state
  let state: string;
  try {
    state = (await $`gh pr view ${prNumber} --json state --jq .state`.text()).trim();

    if (state === 'CLOSED' || state === 'MERGED') {
      throw new Error(`PR #${prNumber} is ${state}. Cannot review`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot review')) {
      throw error;
    }
    throw new Error(`Failed to get PR state for #${prNumber}: ${error}`);
  }

  // Step 3: Check branch match (only if auto-detected)
  if (prArg === undefined) {
    try {
      const headRefName = (
        await $`gh pr view ${prNumber} --json headRefName --jq .headRefName`.text()
      ).trim();

      if (headRefName !== currentBranch) {
        throw new Error(
          `Current branch (${currentBranch}) does not match PR head (${headRefName}). Checkout PR branch first`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not match')) {
        throw error;
      }
      throw new Error(`Failed to verify branch match for PR #${prNumber}: ${error}`);
    }
  }

  // Step 4: Gather PR metadata
  let title: string;
  let url: string;
  let baseRefName: string;
  let headRefName: string;

  try {
    const metadataOutput =
      await $`gh pr view ${prNumber} --json number,title,url,baseRefName,headRefName,state`.text();
    const metadata = JSON.parse(metadataOutput);

    title = metadata.title;
    url = metadata.url;
    baseRefName = metadata.baseRefName;
    headRefName = metadata.headRefName;
    state = metadata.state;
  } catch (error) {
    throw new Error(`Failed to parse PR metadata for #${prNumber}: ${error}`);
  }

  // Step 5: Get file list
  let files: Array<{ path: string }>;
  try {
    const filesOutput = await $`gh pr view ${prNumber} --json files --jq '.files[].path'`.text();
    const filePaths = filesOutput
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    files = filePaths.map((path: string) => ({ path }));
  } catch (error) {
    throw new Error(`Failed to get file list for PR #${prNumber}: ${error}`);
  }

  // Step 6: Get diff (with truncation)
  let diff: string;
  try {
    diff = await $`gh pr diff ${prNumber} --color=never`.text();

    const lines = diff.split('\n');
    const lineCount = lines.length;
    const charCount = diff.length;

    if (lineCount > 4000 || charCount > 200000) {
      diff = lines.slice(0, 4000).join('\n') + '\n[TRUNCATED_DIFF]';
    }
  } catch (error) {
    throw new Error(`Failed to get diff for PR #${prNumber}: ${error}`);
  }

  // Step 7: Detect fork / push permission (GraphQL)
  let canPush = false;
  try {
    const graphqlQuery = `query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){headRefName headRepository{nameWithOwner viewerPermission}}}}`;
    const graphqlOutput =
      await $`gh api graphql -f query=${graphqlQuery} -F owner=${repoOwner} -F repo=${repoName} -F pr=${prNumber}`.text();
    const graphqlData = JSON.parse(graphqlOutput);

    const viewerPermission =
      graphqlData?.data?.repository?.pullRequest?.headRepository?.viewerPermission;

    if (
      viewerPermission === 'WRITE' ||
      viewerPermission === 'MAINTAIN' ||
      viewerPermission === 'ADMIN'
    ) {
      canPush = true;
    }
  } catch {
    // GraphQL errors should not throw - set safe default
    canPush = false;
  }

  // Step 8: Compute review state (deterministic)
  let hasChangesRequested = false;
  const changesRequestedBy: Array<{ login: string; association: string }> = [];

  try {
    const reviewsOutput =
      await $`gh pr view ${prNumber} --json reviews --jq '.reviews[] | {state: .state, login: .author.login, association: .authorAssociation}'`.text();

    const reviewLines = reviewsOutput
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    for (const line of reviewLines) {
      try {
        const review = JSON.parse(line);
        if (
          review.state === 'CHANGES_REQUESTED' &&
          (review.association === 'OWNER' ||
            review.association === 'MEMBER' ||
            review.association === 'COLLABORATOR')
        ) {
          hasChangesRequested = true;
          changesRequestedBy.push({
            login: review.login,
            association: review.association,
          });
        }
      } catch {
        // Skip malformed review lines
        continue;
      }
    }
  } catch {
    // Review fetch errors should not throw - use safe defaults
    hasChangesRequested = false;
  }

  // Step 9: Return PRInfo
  return {
    number: prNumber,
    title,
    url,
    headRefName,
    baseRefName,
    state,
    canPush,
    files,
    diff,
    reviewState: {
      hasChangesRequested,
      changesRequestedBy,
    },
  };
}
