# PR Review Loop: Canonical Reference Spec

This document is the canonical, portable spec snapshot for the OCDX PR review loop implementation.

## Task Flow

```
Preflight -> Identify PR -> Round Loop (<=3)
  Round:
    Parallel Reviewers (1..5) + Comments Analyzer
    -> Aggregate + Consensus
    -> Publish Review Report
    -> If converged: Exit OK
    -> Else: pr-fix (runs dx lint + dx build all, then push) -> orchestrator re-runs dx lint + dx build all -> Publish Fix Report -> next round
```

## SDK-Based Orchestration (Executable Detail)

To avoid relying on undocumented internal delegation tools, orchestration should be implemented as a **plugin custom tool** that uses the OpenCode SDK client APIs.

Mechanism:

- Implement a tool (example name: `ocdx_pr_review_loop`) that:
  - creates child sessions via `client.session.create({ body: { parentID }, query: { directory } })`
  - runs each reviewer/comments-analyzer/pr-fix via `client.session.prompt(...)` with:
    - `body.model = { providerID, modelID }` (parsed from `provider/model` strings in config)
    - `body.agent` set to role-specific agents registered via `opencodeConfig.agent`
    - runs reviewers in parallel using `Promise.all([...prompts])`
  - extracts text from returned `parts` (`type: "text"`) and parses JSON envelopes

SDK references (verified in installed types):

- `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts#L1808` - `SessionCreateData` (create child sessions)
- `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts#L2241` - `SessionPromptData` (prompt with model override)

## Consensus Rules for N Reviewers (+ Comments)

### What to do:

- Aggregate all findings (no dedupe) from:
  - N reviewers
  - comments analyzer (unresolved threads)
- Compute total counts for P0/P1/P2/P3.
- Apply consensus rules (adapted from the reference):
  - Rule 0: If PR review state has CHANGES_REQUESTED by OWNER/MEMBER/COLLABORATOR => consensus = request_changes
  - Rule 1: If P0 > 0 => needs_major_work
  - Rule 2: Else if P1 > 0 => request_changes
  - Rule 3: Else if P2 > 0 => request_changes
  - Rule 4: Else => approve

### Acceptance Criteria:

- Consensus computation is deterministic and printed in the PR report.

## Comment Publishing + Sanitization Policy

### What to do:

- All PR comments posted by the orchestrator MUST include `<!-- pr-review-loop-marker -->`.
- Publishing strategy (deterministic):
  - Post a NEW comment for every review report (Phase B.4 equivalent).
  - Post a NEW comment for every fix report (Phase D.5 equivalent).
  - Never edit/update existing comments.

Concrete command pattern (deterministic):

```bash
gh pr comment <PR> --body-file - <<'EOF'
<!-- pr-review-loop-marker -->
<markdown body>
EOF
```

TypeScript implementation policy (deterministic):

- Build the comment body string (already sanitized) and apply a hard cap (e.g., 60000 chars). If exceeded, truncate and append `"[TRUNCATED_COMMENT]"`.
- Write to a temp file (e.g., `path.join(os.tmpdir(), 'ocdx-pr-review-loop-<pr>-<round>.md')`).
- Run: `gh pr comment <PR> --body-file <tempFile>`.
- Always delete the temp file in a finally block.

- Reports MUST NOT include raw full diffs, stack traces containing secrets, or environment variable values.
- Before calling `gh pr comment`, sanitize report text:
  - Redact any line containing common secret patterns (apply string replacement):
    - `AKIA`-style AWS keys
    - `BEGIN PRIVATE KEY`
    - `xoxb-` Slack tokens
    - `ghp_` GitHub tokens
  - If a reviewer includes code blocks that look like full diffs (`diff --git`), replace with `[DIFF REDACTED]`.

### Acceptance Criteria:

- Orchestrator never posts `diff --git` content in PR comments.
- If secret-like patterns appear in agent output, they are replaced with `[REDACTED]` before posting.

## Loop Termination (Concrete)

- Hard cap: 3 rounds.
- Early exit success: P0=P1=P2=0 AND (no unresolved reviewThreads) AND consensus == approve.
- Recurring issue policy:
  - Track finding IDs across rounds.
  - Definition: a finding is "reported as fixed" if `pr-fix` returns it in `fixedIssues[]`.
  - If a finding ID that was reported fixed in round N appears again in round N+1:
    - mark it as `stuck`
    - exclude it from `issuesToFix` in subsequent rounds
    - include it under a "stuck" section in the PR report
  - Early-stop rule: if after excluding stuck findings there are no remaining non-stuck P0/P1/P2 code findings to fix, exit early with "manual intervention required".

---

## Appendix A: Canonical Data Shapes

This appendix is the canonical, portable spec snapshot that the implementation should follow.

### A1) Finding

```json
{
  "id": "SEC-001",
  "priority": "P0",
  "category": "security",
  "file": "src/auth.ts",
  "line": 42,
  "title": "Hard-coded token",
  "description": "...",
  "suggestion": "...",
  "source": {
    "type": "agent",
    "name": "reviewer-1",
    "reviewId": null,
    "timestamp": "2026-01-24T00:00:00Z"
  }
}
```

Notes:

- `line` may be null when unknown.
- `source.reviewId` is used for GitHub thread/comment IDs when available.

### A2) Reviewer Result (N reviewers)

```json
{
  "agent": "reviewer-1",
  "prNumber": 123,
  "conclusion": "approve",
  "issues": { "p0_blocking": 0, "p1_critical": 0, "p2_important": 0, "p3_suggestion": 0 },
  "findings": [],
  "fullReport": "Markdown report (no full diffs)"
}
```

### A3) Comments Analyzer Result

```json
{
  "agent": "comments-analyzer",
  "prNumber": 123,
  "reviewState": {
    "hasChangesRequested": false,
    "changesRequestedBy": [{ "login": "reviewer", "association": "MEMBER" }]
  },
  "stats": { "totalThreads": 0, "resolvedThreads": 0, "unresolvedThreads": 0 },
  "threadsTruncated": false,
  "issues": { "p0_blocking": 0, "p1_critical": 0, "p2_important": 0, "p3_suggestion": 0 },
  "pendingIssues": [],
  "fullReport": "Markdown report"
}
```

### A4) Fix Payload (orchestrator -> pr-fix)

```json
{
  "prNumber": 123,
  "round": 1,
  "issuesToFix": [],
  "optionalIssues": []
}
```

### A5) Fix Result (pr-fix -> orchestrator)

```json
{
  "agent": "pr-fix",
  "prNumber": 123,
  "summary": { "fixed": 0, "rejected": 0, "deferred": 0 },
  "fixedIssues": [{ "findingId": "SEC-001", "commitSha": "abcdef0", "description": "..." }],
  "rejectedIssues": [{ "findingId": "SEC-002", "reason": "..." }],
  "commits": [{ "sha": "abcdef0", "message": "fix: ..." }]
}
```

Invariant:

- `fixedIssues.length + rejectedIssues.length == issuesToFix.length`.

### A6) Consensus Rules

Inputs:

- All reviewer findings + comments analyzer findings (no dedupe)
- Comments analyzer reviewState

Rules:

- If `reviewState.hasChangesRequested` from OWNER/MEMBER/COLLABORATOR => `request_changes`
- Else if P0 > 0 => `needs_major_work`
- Else if P1 > 0 => `request_changes`
- Else if P2 > 0 => `request_changes`
- Else => `approve`

### A7) GitHub Comment Marker

All orchestrator-posted comments MUST include:

```text
<!-- pr-review-loop-marker -->
```

And the comments analyzer MUST ignore any comment containing that marker.
