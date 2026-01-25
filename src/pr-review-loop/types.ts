/**
 * PR Review Loop Data Shapes
 * Based on Appendix A from the implementation plan
 */

/** A1: Finding (code issue or review comment) */
export interface Finding {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  file: string;
  line: number | null;
  title: string;
  description: string;
  suggestion: string;
  source: {
    type: 'agent' | 'human';
    name: string;
    reviewId: string | null;
    timestamp: string;
  };
}

/** A2: Reviewer Result (output from one reviewer) */
export interface ReviewerResult {
  agent: string;
  prNumber: number;
  conclusion: 'approve' | 'request_changes' | 'needs_major_work';
  issues: {
    p0_blocking: number;
    p1_critical: number;
    p2_important: number;
    p3_suggestion: number;
  };
  findings: Finding[];
  fullReport: string;
}

/** A3: Comments Analyzer Result */
export interface CommentsAnalyzerResult {
  agent: string;
  prNumber: number;
  reviewState: {
    hasChangesRequested: boolean;
    changesRequestedBy: Array<{ login: string; association: string }>;
  };
  stats: {
    totalThreads: number;
    resolvedThreads: number;
    unresolvedThreads: number;
  };
  threadsTruncated: boolean;
  issues: {
    p0_blocking: number;
    p1_critical: number;
    p2_important: number;
    p3_suggestion: number;
  };
  pendingIssues: Finding[];
  fullReport: string;
}

/** A4: Fix Payload (orchestrator → pr-fix) */
export interface FixPayload {
  prNumber: number;
  round: number;
  issuesToFix: Finding[];
  optionalIssues: Finding[];
}

/** A5: Fix Result (pr-fix → orchestrator) */
export interface FixResult {
  agent: string;
  prNumber: number;
  summary: {
    fixed: number;
    rejected: number;
    deferred: number;
  };
  fixedIssues: Array<{
    findingId: string;
    commitSha: string;
    description: string;
  }>;
  rejectedIssues: Array<{
    findingId: string;
    reason: string;
  }>;
  commits: Array<{
    sha: string;
    message: string;
  }>;
}

/** PR metadata (not in Appendix A, but needed for workflow) */
export interface PRInfo {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  state: string;
  canPush: boolean;
  files: Array<{ path: string }>;
  diff: string;
  reviewState: {
    hasChangesRequested: boolean;
    changesRequestedBy: Array<{ login: string; association: string }>;
  };
}

/** Preflight check result */
export interface PreflightResult {
  success: boolean;
  error?: string;
  currentBranch?: string;
  repoOwner?: string;
  repoName?: string;
}

/** Model configuration parsed from provider/model strings */
export interface ModelConfig {
  providerID: string;
  modelID: string;
}
