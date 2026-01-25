/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Plugin as OpenCodePlugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { loadOcdxConfigStrict, ConfigError } from './config';
import { runPreflightChecks } from './pr-review-loop/preflight';
import { detectPR } from './pr-review-loop/pr-detection';
import { parseModelString, extractJsonEnvelope, loadPromptAsset } from './pr-review-loop/utils';
import type {
  ReviewerResult,
  CommentsAnalyzerResult,
  Finding,
  FixResult,
} from './pr-review-loop/types';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Resolve asset file paths (works from both src/ in dev mode and dist/ when compiled)
 *
 * @param relFromRepoRoot - Path relative to repository root (e.g., 'src/prompts/pr-review-loop/reviewer.md')
 * @returns URL object pointing to the asset file
 *
 * @example
 * const promptPath = assetUrl('src/prompts/pr-review-loop/reviewer.md');
 * const content = await fs.readFile(promptPath, 'utf-8');
 */
export function assetUrl(relFromRepoRoot: string): URL {
  const moduleDir = new URL('.', import.meta.url);
  const repoRoot = new URL('..', moduleDir); // parent of src/ or dist/
  return new URL(relFromRepoRoot, repoRoot);
}

/**
 * Hello World OpenCode Plugin
 *
 * This is a simple example plugin that demonstrates:
 * - Custom tool registration
 * - Event handling
 * - Session tracking
 * - Structured logging
 */

export const HelloWorldPlugin: OpenCodePlugin = async ({ client, directory, $ }) => {
  // Plugin initialization
  // Track session state
  const sessions = new Map<string, { createdAt: Date; toolsExecuted: number }>();

  return {
    /**
     * Custom Tools
     */
    tool: {
      // Simple greeting tool
      hello: tool({
        description: 'Say hello to someone',
        args: {
          name: tool.schema.string().describe('Name to greet'),
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async execute(args, _ctx) {
          return `👋 Hello, ${args.name}! Welcome to OpenCode!`;
        },
      }),

      // Tool that executes shell commands
      check_directory: tool({
        description: 'Check current directory information',
        args: {},
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async execute(_args, _ctx) {
          try {
            // Use Bun's shell API
            const files = await $`ls -la ${directory}`.text();
            const gitStatus = await $`git status 2>&1 || echo "Not a git repository"`.text();

            return `
## Directory Information

**Path:** \`${directory}\`

**Files:**
\`\`\`
${files}
\`\`\`

**Git Status:**
\`\`\`
${gitStatus}
\`\`\`
            `.trim();
          } catch (error) {
            return `Error checking directory: ${error}`;
          }
        },
      }),

      // PR Review Loop orchestrator (PHASE 1: skeleton only)
      ocdx_pr_review_loop: tool({
        description:
          'Run multi-model PR review loop with auto-fix (orchestrates reviewers, consensus, and fixes)',
        args: {
          pr: tool.schema
            .number()
            .optional()
            .describe('PR number (auto-detect from current branch if omitted)'),
        },

        async execute(args, _ctx) {
          // Step 1: Validate config FIRST (before any PR actions)
          let config;
          try {
            config = await loadOcdxConfigStrict();
          } catch (error) {
            if (error instanceof ConfigError) {
              return `❌ Configuration Error

Error Code: \`${error.code}\`

Message: ${error.message}

Config File: \`${error.configPath}\`

Expected Format:
\`\`\`json
${error.exampleJson}
\`\`\`

Action Required: Create or fix the config file at the path above.`;
            }
            throw error;
          }

          // Step 2: Run preflight checks
          const preflightResult = await runPreflightChecks($, directory);

          if (!preflightResult.success) {
            return `❌ Preflight Check Failed

Error: ${preflightResult.error}

Cannot proceed with PR review loop. Fix the issue above and try again.`;
          }

          // Step 3: Detect and gather PR metadata
          let prInfo;
          try {
            prInfo = await detectPR(
              $,
              args.pr,
              preflightResult.currentBranch!,
              preflightResult.repoOwner!,
              preflightResult.repoName!
            );
          } catch (error) {
            if (error instanceof Error) {
              return `❌ PR Detection Failed

Error: ${error.message}

Cannot proceed with PR review loop.`;
            }
            throw error;
          }

          // Phase B: Single Reviewer Session + Comment Publishing

          const roundHistory: any[] = [];
          let round = 0;
          let consensus = '';
          let totalCounts = {
            p0_blocking: 0,
            p1_critical: 0,
            p2_important: 0,
            p3_suggestion: 0,
          };
          let allFindings: Finding[] = [];

          for (round = 1; round <= 3; round++) {
            // Step 5: Run N reviewers concurrently
            const reviewerPromises = config.reviewerModels.map(async (reviewerModel, idx) => {
              const { providerID, modelID } = parseModelString(reviewerModel);

              // Load reviewer prompt
              const reviewerPromptTemplate = await loadPromptAsset('reviewer.md');

              // Construct PR context
              const prContext = `
## PR Metadata
${JSON.stringify({ number: prInfo.number, title: prInfo.title, url: prInfo.url, baseRefName: prInfo.baseRefName, headRefName: prInfo.headRefName }, null, 2)}

## Files Changed (${prInfo.files.length} files)
${prInfo.files.map((f) => f.path).join('\n')}

## Diff
${prInfo.diff}
`;

              const reviewerPrompt = reviewerPromptTemplate + '\n\n' + prContext;

              // Create child session
              const reviewerSession = await client.session.create({
                body: { parentID: _ctx.sessionID },
                query: { directory },
              });

              // Prompt reviewer with model override
              const reviewerResponse = await client.session.prompt({
                path: { id: reviewerSession.data!.id },
                query: { directory },
                body: {
                  model: { providerID, modelID },
                  agent: 'ocdx-reviewer',
                  parts: [{ type: 'text', text: reviewerPrompt }],
                },
              });

              // Extract text from response parts
              const reviewerText = reviewerResponse
                .data!.parts.filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('\n');

              // Parse JSON envelope
              const reviewerJson = extractJsonEnvelope(reviewerText);

              if (!reviewerJson) {
                throw new Error(
                  `Reviewer ${idx + 1} (${reviewerModel}) did not return valid JSON envelope`
                );
              }

              return reviewerJson as ReviewerResult;
            });

            // Step 6: Run comments analyzer concurrently
            const commentsAnalyzerPromise = (async () => {
              const analyzerModel = config.commentsAnalyzerModel;
              const { providerID, modelID } = parseModelString(analyzerModel);

              // Load comments analyzer prompt
              const analyzerPromptTemplate = await loadPromptAsset('comments-analyzer.md');

              // Get review threads via GraphQL
              const reviewThreadsOutput =
                await $`gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved comments(first:50){nodes{id body author{login} authorAssociation path line}}}}}}}' -F owner=${preflightResult.repoOwner!} -F repo=${preflightResult.repoName!} -F pr=${prInfo.number}`.text();
              const reviewThreadsData = JSON.parse(reviewThreadsOutput);

              // Construct analyzer context
              const analyzerContext = `
## PR Metadata
${JSON.stringify({ number: prInfo.number, title: prInfo.title, url: prInfo.url }, null, 2)}

## Review State (Tool-Computed)
${JSON.stringify(prInfo.reviewState, null, 2)}

## Review Threads (GraphQL)
${JSON.stringify(reviewThreadsData, null, 2)}
`;

              const analyzerPrompt = analyzerPromptTemplate + '\n\n' + analyzerContext;

              // Create child session
              const analyzerSession = await client.session.create({
                body: { parentID: _ctx.sessionID },
                query: { directory },
              });

              // Prompt analyzer with model override
              const analyzerResponse = await client.session.prompt({
                path: { id: analyzerSession.data!.id },
                query: { directory },
                body: {
                  model: { providerID, modelID },
                  agent: 'ocdx-comments-analyzer',
                  parts: [{ type: 'text', text: analyzerPrompt }],
                },
              });

              // Extract text from response parts
              const analyzerText = analyzerResponse
                .data!.parts.filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('\n');

              // Parse JSON envelope
              const analyzerJson = extractJsonEnvelope(analyzerText);

              if (!analyzerJson) {
                throw new Error('Comments analyzer did not return valid JSON envelope');
              }

              return analyzerJson as CommentsAnalyzerResult;
            })();

            // Wait for all reviewers and comments analyzer
            const [reviewerResults, analyzerResult] = await Promise.all([
              Promise.allSettled(reviewerPromises),
              commentsAnalyzerPromise,
            ]);

            // Check for partial execution
            const successfulReviewers = reviewerResults.filter(
              (r) => r.status === 'fulfilled'
            ) as PromiseFulfilledResult<ReviewerResult>[];

            if (successfulReviewers.length === 0) {
              const errors = reviewerResults
                .filter((r) => r.status === 'rejected')
                .map((r, idx) => `  - Reviewer ${idx + 1}: ${(r as PromiseRejectedResult).reason}`)
                .join('\n');

              return `❌ All Reviewers Failed

No reviewers succeeded. Cannot produce credible review.

Errors:
${errors}

Please check model availability and prompt configuration.`;
            }

            // Step 7: Aggregate findings from all sources
            allFindings = [];

            // Concatenate findings from all successful reviewers
            for (const reviewer of successfulReviewers) {
              allFindings.push(...reviewer.value.findings);
            }

            // Append findings from comments analyzer
            allFindings.push(...analyzerResult.pendingIssues);

            // Compute total counts across all findings
            totalCounts = {
              p0_blocking: 0,
              p1_critical: 0,
              p2_important: 0,
              p3_suggestion: 0,
            };

            for (const finding of allFindings) {
              if (finding.priority === 'P0') totalCounts.p0_blocking++;
              else if (finding.priority === 'P1') totalCounts.p1_critical++;
              else if (finding.priority === 'P2') totalCounts.p2_important++;
              else if (finding.priority === 'P3') totalCounts.p3_suggestion++;
            }

            // Step 8: Compute consensus (deterministic rule evaluation)

            // Rule 0: Existing GitHub reviewer requested changes (highest priority)
            if (prInfo.reviewState.hasChangesRequested) {
              consensus = 'request_changes';
            }
            // Rule 1: P0 findings → needs major work
            else if (totalCounts.p0_blocking > 0) {
              consensus = 'needs_major_work';
            }
            // Rule 2: P1 findings → request changes
            else if (totalCounts.p1_critical > 0) {
              consensus = 'request_changes';
            }
            // Rule 3: P2 findings → request changes
            else if (totalCounts.p2_important > 0) {
              consensus = 'request_changes';
            }
            // Rule 4: No blocking issues → approve
            else {
              consensus = 'approve';
            }

            // Step 6: Create PR comment markdown with aggregated findings and computed consensus
            const reviewReport = `<!-- pr-review-loop-marker -->
# 🔍 PR Review Report (Round ${round})

**Reviewers:** ${successfulReviewers.length}/${config.reviewerModels.length} successful
**PR:** #${prInfo.number}
**Consensus:** ${consensus}

## Issues Summary

| Priority | Count |
|----------|-------|
| P0 (Blocking) | ${totalCounts.p0_blocking} |
| P1 (Critical) | ${totalCounts.p1_critical} |
| P2 (Important) | ${totalCounts.p2_important} |
| P3 (Suggestion) | ${totalCounts.p3_suggestion} |

## Comments Analyzer

- Total threads: ${analyzerResult.stats.totalThreads}
- Resolved: ${analyzerResult.stats.resolvedThreads}
- Unresolved: ${analyzerResult.stats.unresolvedThreads}

## Findings

${
  allFindings.length === 0
    ? '*No issues found.*'
    : allFindings
        .map(
          (f, idx) => `
### ${idx + 1}. [${f.priority}] ${f.title}
- **File:** \`${f.file}\`${f.line ? ` (line ${f.line})` : ''}
- **Category:** ${f.category}
- **Description:** ${f.description}
- **Suggestion:** ${f.suggestion}
`
        )
        .join('\n')
}

## Review Sources

- Automated reviewers: ${successfulReviewers.length} models analyzed code
- Comments analyzer: ${analyzerResult.stats.unresolvedThreads} unresolved threads
- Consensus: Applied deterministic rules to aggregated findings

---
*Generated by ocdx PR Review Loop (Phase B: Aggregated Review)*
`;

            // Step 7: Post comment to PR
            const tempFile = join(tmpdir(), `ocdx-pr-review-${prInfo.number}-round${round}.md`);

            try {
              await writeFile(tempFile, reviewReport, 'utf-8');
              await $`gh pr comment ${prInfo.number} --body-file ${tempFile}`.quiet();
            } finally {
              try {
                await unlink(tempFile);
              } catch {
                // Ignore cleanup errors
              }
            }

            // Track round results for history
            roundHistory.push({
              round,
              consensus,
              totalCounts,
              findingsCount: allFindings.length,
            });

            // Step 9: Fix decision logic
            // Check exit conditions in order (deterministic)

            // Exit Condition 1: Consensus is approve → SUCCESS, exit loop
            if (consensus === 'approve') {
              return `✅ PR Review Complete - Approved (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models (${successfulReviewers.length} successful)
${reviewerResults.filter((r) => r.status === 'rejected').length > 0 ? `- Failed: ${reviewerResults.filter((r) => r.status === 'rejected').length}\n` : ''}
**PR:** #${prInfo.number} - ${prInfo.title}

**Review Results:**
- Consensus: ${consensus} ✅
- P0: ${totalCounts.p0_blocking}
- P1: ${totalCounts.p1_critical}
- P2: ${totalCounts.p2_important}
- P3: ${totalCounts.p3_suggestion}
- Findings: ${allFindings.length}
- Comments analyzer: ${analyzerResult.stats.unresolvedThreads} unresolved threads

**Comment Posted:** ${prInfo.url}

**Outcome:** No blocking issues found. PR is ready for merge.
`;
            }

            // Exit Condition 2: Cannot push to PR → REVIEW ONLY, exit after round 1
            if (!prInfo.canPush) {
              return `⚠️ PR Review Complete - Review Only Mode (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models (${successfulReviewers.length} successful)

**PR:** #${prInfo.number} - ${prInfo.title}

**Review Results:**
- Consensus: ${consensus}
- P0: ${totalCounts.p0_blocking}
- P1: ${totalCounts.p1_critical}
- P2: ${totalCounts.p2_important}
- P3: ${totalCounts.p3_suggestion}
- Findings: ${allFindings.length}

**Reason:** No push permission to PR head repository.
**Action:** Review report posted. Manual fixes required.

**Comment Posted:** ${prInfo.url}
`;
            }

            // Exit Condition 3: Unresolved human review threads → MANUAL RESOLUTION REQUIRED
            if (analyzerResult.stats.unresolvedThreads > 0) {
              return `⚠️ PR Review Complete - Manual Resolution Required (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models (${successfulReviewers.length} successful)

**PR:** #${prInfo.number} - ${prInfo.title}

**Review Results:**
- Consensus: ${consensus}
- P0: ${totalCounts.p0_blocking}
- P1: ${totalCounts.p1_critical}
- P2: ${totalCounts.p2_important}
- P3: ${totalCounts.p3_suggestion}
- Unresolved threads: ${analyzerResult.stats.unresolvedThreads}

**Reason:** ${analyzerResult.stats.unresolvedThreads} unresolved review thread(s) require human attention.
**Action:** Review report posted. Cannot proceed with auto-fix until threads are resolved.

**Comment Posted:** ${prInfo.url}
`;
            }

            // Proceed with fix if:
            // - consensus is NOT 'approve' (blocking issues exist)
            // - canPush === true
            // - no unresolved threads

            // Step 10: Prepare fix payload (P0/P1/P2 only)
            const issuesToFix = allFindings.filter((f) => ['P0', 'P1', 'P2'].includes(f.priority));

            if (issuesToFix.length === 0) {
              // No fixable issues (only P3 suggestions remain)
              return `✅ PR Review Complete - No Fixable Issues (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models (${successfulReviewers.length} successful)

**PR:** #${prInfo.number} - ${prInfo.title}

**Review Results:**
- Consensus: ${consensus}
- P0: ${totalCounts.p0_blocking}
- P1: ${totalCounts.p1_critical}
- P2: ${totalCounts.p2_important}
- P3: ${totalCounts.p3_suggestion} (suggestions only)
- Findings: ${allFindings.length}

**Outcome:** Only P3 suggestions remain. No auto-fix required.

**Comment Posted:** ${prInfo.url}
`;
            }

            // Step 11: Run pr-fix session
            const fixModel = config.prFixModel;
            const { providerID: fixProviderID, modelID: fixModelID } = parseModelString(fixModel);

            // Load pr-fix prompt
            const fixPromptTemplate = await loadPromptAsset('pr-fix.md');

            const fixContext = `
## PR Metadata
${JSON.stringify({ number: prInfo.number, title: prInfo.title, url: prInfo.url }, null, 2)}

## Issues to Fix (P0/P1/P2 only)
${JSON.stringify(issuesToFix, null, 2)}

## Round
${round}
`;

            const fixPrompt = fixPromptTemplate + '\n\n' + fixContext;

            // Create pr-fix session
            const fixSession = await client.session.create({
              body: { parentID: _ctx.sessionID },
              query: { directory },
            });

            // Prompt pr-fix with model override
            const fixResponse = await client.session.prompt({
              path: { id: fixSession.data!.id },
              query: { directory },
              body: {
                model: { providerID: fixProviderID, modelID: fixModelID },
                agent: 'ocdx-pr-fix',
                parts: [{ type: 'text', text: fixPrompt }],
              },
            });

            // Extract text from response parts
            const fixText = fixResponse
              .data!.parts.filter((part: any) => part.type === 'text')
              .map((part: any) => part.text)
              .join('\n');

            // Parse JSON envelope
            const fixJson = extractJsonEnvelope(fixText);

            if (!fixJson) {
              return `❌ PR Fix Failed - Invalid Response (Round ${round})

**Error:** pr-fix agent did not return valid JSON envelope.

**PR:** #${prInfo.number} - ${prInfo.title}

**Action:** Manual intervention required. Check pr-fix prompt and agent configuration.
`;
            }

            const fixResult = fixJson as FixResult;

            // Step 12: Verification workflow (dx lint + dx build all)
            // pr-fix should have already run these before pushing, but we verify again
            let verificationPassed = true;
            const verificationErrors: string[] = [];

            try {
              // Run dx lint
              await $`dx lint`.quiet();
            } catch {
              verificationPassed = false;
              verificationErrors.push('dx lint failed');
            }

            try {
              // Run dx build all
              await $`dx build all`.quiet();
            } catch {
              verificationPassed = false;
              verificationErrors.push('dx build all failed');
            }

            // If verification failed, publish error report and exit
            if (!verificationPassed) {
              // Build fix report with verification failure
              const fixReportFailed = `<!-- pr-review-loop-marker -->
# ⚠️ PR Fix Failed - Verification Error (Round ${round})

**PR:** #${prInfo.number}

**Fix Attempted:**
- Issues to fix: ${issuesToFix.length}
- Fixed: ${fixResult.summary.fixed}
- Rejected: ${fixResult.summary.rejected}
- Commits created: ${fixResult.commits.length}

**Verification Failed:**
${verificationErrors.map((e) => `  - ❌ ${e}`).join('\n')}

**Action Required:**
The pr-fix agent created commits but they do not pass verification. Manual intervention required.

**Commits Created:**
${fixResult.commits.map((c) => `  - ${c.sha.substring(0, 7)}: ${c.message}`).join('\n')}

---
*Generated by ocdx PR Review Loop*
`;

              // Post verification failure report to PR
              const tempFileFailed = join(
                tmpdir(),
                `ocdx-pr-fix-failed-${prInfo.number}-round${round}.md`
              );

              try {
                await writeFile(tempFileFailed, fixReportFailed, 'utf-8');
                await $`gh pr comment ${prInfo.number} --body-file ${tempFileFailed}`.quiet();
              } finally {
                try {
                  await unlink(tempFileFailed);
                } catch {
                  // Ignore cleanup errors
                }
              }

              return `❌ PR Fix Failed - Verification Error (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models (${successfulReviewers.length} successful)
- Fix model: ${fixModel}

**PR:** #${prInfo.number} - ${prInfo.title}

**Fix Results:**
- Issues to fix: ${issuesToFix.length}
- Fixed: ${fixResult.summary.fixed}
- Rejected: ${fixResult.summary.rejected}
- Commits: ${fixResult.commits.length}

**Verification Failed:**
${verificationErrors.map((e) => `  - ❌ ${e}`).join('\n')}

**Action:** Verification failure report posted to PR. Manual intervention required.

**Comment Posted:** ${prInfo.url}
`;
            }

            // Step 13: Verification passed - publish fix report
            const fixReport = `<!-- pr-review-loop-marker -->
# 🔧 PR Fix Report (Round ${round})

**PR:** #${prInfo.number}

**Fix Summary:**
- Issues to fix: ${issuesToFix.length}
- Fixed: ${fixResult.summary.fixed} ✅
- Rejected: ${fixResult.summary.rejected}
- Deferred: ${fixResult.summary.deferred}
- Commits created: ${fixResult.commits.length}

**Verification:** ✅ All checks passed
- dx lint: ✅
- dx build all: ✅

**Commits Created:**
${fixResult.commits.map((c) => `  - ${c.sha.substring(0, 7)}: ${c.message}`).join('\n')}

**Fixed Issues:**
${
  fixResult.fixedIssues
    .map((f) => {
      const finding = allFindings.find((af) => af.id === f.findingId);
      return `  - [✅] ${finding?.title || f.findingId}: ${f.description}`;
    })
    .join('\n') || '  (none)'
}

**Rejected Issues:**
${
  fixResult.rejectedIssues
    .map((r) => {
      const finding = allFindings.find((af) => af.id === r.findingId);
      return `  - [❌] ${finding?.title || r.findingId}: ${r.reason}`;
    })
    .join('\n') || '  (none)'
}

---
*Generated by ocdx PR Review Loop*
`;

            // Post fix report to PR
            const tempFileSuccess = join(tmpdir(), `ocdx-pr-fix-${prInfo.number}-round${round}.md`);

            try {
              await writeFile(tempFileSuccess, fixReport, 'utf-8');
              await $`gh pr comment ${prInfo.number} --body-file ${tempFileSuccess}`.quiet();
            } finally {
              try {
                await unlink(tempFileSuccess);
              } catch {
                // Ignore cleanup errors
              }
            }

            // Step 14: Continue to next round
            // After successful fix, loop will continue to round+1 and re-run review
            // This allows us to verify fixes worked and catch any new issues

            // If this was round 3, we've hit max rounds - will exit via fallback below
            if (round === 3) {
              // Don't continue - let loop exit and hit max rounds message
              // The max rounds message will show final state
            }

            // Loop continues to next round automatically (for loop increment)
            // Next iteration will re-run review and check if P0/P1/P2 are resolved
          }

          // Max rounds reached
          return `⚠️ Max Rounds Reached (Round ${round})

**Configuration:**
- Reviewers: ${config.reviewerModels.length} models
- Max rounds: 3

**PR:** #${prInfo.number} - ${prInfo.title}

**Final State:**
${
  consensus === 'approve'
    ? '- Consensus: approve ✅ (all issues resolved)'
    : `- Consensus: ${consensus}
- P0: ${totalCounts.p0_blocking}
- P1: ${totalCounts.p1_critical}
- P2: ${totalCounts.p2_important}
- P3: ${totalCounts.p3_suggestion}
- Remaining findings: ${allFindings.length}`
}

**Round History:**
${roundHistory.map((r) => `- Round ${r.round}: ${r.consensus} (P0:${r.totalCounts.p0_blocking}, P1:${r.totalCounts.p1_critical}, P2:${r.totalCounts.p2_important}, P3:${r.totalCounts.p3_suggestion})`).join('\n')}

**Action Required:** Max rounds reached. ${
            totalCounts.p0_blocking + totalCounts.p1_critical + totalCounts.p2_important > 0
              ? 'Manual intervention needed to resolve remaining issues.'
              : 'Review reports and fix reports posted to PR.'
          }

**Comments Posted:** ${prInfo.url}
`;
        },
      }),
    },

    /**
     * Event Handler
     * Handles various OpenCode events
     */
    event: async ({ event }) => {
      // Session created
      if (event.type === 'session.created') {
        const sessionId = (event as any).session_id || 'unknown';
        sessions.set(sessionId, {
          createdAt: new Date(),
          toolsExecuted: 0,
        });
      }

      // Session completed or deleted
      if (event.type === 'session.idle' || event.type === 'session.deleted') {
        const sessionId = (event as any).session_id || 'unknown';
        const sessionData = sessions.get(sessionId);

        if (sessionData) {
          sessions.delete(sessionId);
        }
      }

      // Track tool executions
      if (event.type === 'message.part.updated') {
        const { part } = (event as any).properties || {};
        if (part?.type === 'tool' && part.state?.status === 'completed') {
          const sessionId = (event as any).session_id;
          const sessionData = sessions.get(sessionId);

          if (sessionData) {
            sessionData.toolsExecuted++;
          }
        }
      }
    },

    /**
     * Configuration Hook
     * Modify OpenCode configuration
     */
    config: async (opencodeConfig) => {
      // Add custom command
      opencodeConfig.command ??= {};
      opencodeConfig.command['hello'] = {
        template: 'Use the hello tool to greet me!',
        description: 'Quick greeting command',
      };

      opencodeConfig.command['pr-review-loop'] = {
        description: 'Run multi-model PR review + auto-fix loop',
        template: `You are a command dispatcher.

Raw arguments: "$ARGUMENTS"

Rules:
- If $1 == "--pr": call tool ocdx_pr_review_loop with {"pr": parseInt($2)}
- Else if $1 is empty: call tool ocdx_pr_review_loop with {} (auto-detect)
- Else: print usage and stop

Usage:
  /pr-review-loop
  /pr-review-loop --pr <PR_NUMBER>

Do not do any other work besides calling the tool.`,
      };

      // Define agents for PR review workflow (read-only reviewers, editable pr-fix)
      opencodeConfig.agent ??= {};

      opencodeConfig.agent['ocdx-reviewer'] = {
        mode: 'subagent',
        tools: {
          bash: true,
          read: true,
          grep: true,
          glob: true,
          edit: false,
        },
        permission: {
          edit: 'deny',
        },
      };

      opencodeConfig.agent['ocdx-comments-analyzer'] = {
        mode: 'subagent',
        tools: {
          bash: true,
          edit: false,
        },
        permission: {
          edit: 'deny',
        },
      };

      opencodeConfig.agent['ocdx-pr-fix'] = {
        mode: 'subagent',
        tools: {
          bash: true,
          read: true,
          grep: true,
          glob: true,
          edit: true,
        },
        permission: {
          edit: 'allow',
          bash: {
            deny: ['git push --force*', 'git push -f*'],
            allow: ['dx *', 'git status*', 'git diff*', 'git add*', 'git commit*'],
            ask: ['git push*'],
          },
        },
      } as any;
    },
  };
};

// Export as default for OpenCode compatibility
export default HelloWorldPlugin;
