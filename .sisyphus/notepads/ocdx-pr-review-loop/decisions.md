# Implementation Decisions

## [2026-01-25T00:35:00Z] TODO 4-7 Scope Assessment

### Remaining Work: PR Workflow Implementation
TODO 4-7 represents the actual PR review loop logic - this is the core business value but also the most complex part.

### Estimated Complexity
- **TODO 4**: Preflight checks + PR identification (~200-300 lines)
  - 8 preflight checks (gh auth, git status, dx existence, etc.)
  - PR identification with auto-detect logic
  - Fork/permission detection via GraphQL
  - Review state computation
  
- **TODO 5**: Reviewer agent output contract (~50 lines utility code)
  - JSON envelope parsing
  - Finding ID generation (SHA-1 hash)
  - Large diff handling
  
- **TODO 6**: Comments analyzer behavior (~100 lines)
  - GraphQL review threads pagination
  - Thread filtering (ignore bot comments)
  - Mapping to Finding shape
  
- **TODO 7**: pr-fix payload + verification (~150 lines)
  - Fix payload construction
  - Verification commands (dx lint + dx build all)
  - Commit tracking
  
- **TODO 4 (Round Loop)**: Multi-model orchestration (~300-400 lines)
  - SDK session.create/prompt for each reviewer
  - Promise.allSettled for concurrent execution
  - JSON envelope extraction and parsing
  - Consensus computation
  - PR comment publishing with sanitization
  - Fix loop implementation
  - Stuck-finding detection
  - Max rounds handling

### Total Estimated LOC: 800-1200 lines
This is substantial - likely needs to be broken into helper modules:
- `src/pr-review-loop/preflight.ts`
- `src/pr-review-loop/pr-detection.ts`
- `src/pr-review-loop/reviewers.ts`
- `src/pr-review-loop/consensus.ts`
- `src/pr-review-loop/publisher.ts`
- `src/pr-review-loop/types.ts`
- `src/pr-review-loop/utils.ts`

### Recommended Approach
Given the complexity, suggest breaking TODO 4-7 into phases:

**Phase A**: Preflight + PR Detection
- Implement preflight checks
- Implement PR identification
- Return detailed PR summary (no review yet)

**Phase B**: Single-Model Review Stub
- Implement one reviewer call (not N)
- Parse JSON envelope
- Post review report to PR
- Verify comment publishing works

**Phase C**: Multi-Model Review
- Extend to N reviewers
- Add comments analyzer
- Implement consensus
- Verify aggregation logic

**Phase D**: Fix Loop
- Implement pr-fix session
- Add verification (dx lint + dx build all)
- Implement round loop
- Add stuck-finding detection

**Phase E**: Edge Cases
- Fork handling
- Review-only mode
- Max rounds
- Error handling polish

### Session Token Budget
Current usage: ~82K/1M tokens
Remaining: ~918K tokens
Estimated for TODO 4-7 full implementation: 300-500K tokens (multiple iterations)

Budget is healthy - can complete in this session if we proceed methodically.

## [2026-01-25T19:05:00Z] Phase B Approach: Incremental Review Workflow

### Strategy Decision
Instead of building all multi-model review logic at once, implement incrementally:

**Phase B Goal:** Single reviewer + comment publishing (verify SDK integration works)
- Call ONE reviewer model (config.reviewerModels[0])
- Load reviewer prompt asset
- Create session + prompt via SDK
- Parse JSON envelope
- Post PR comment
- Verify end-to-end flow

**Why Incremental:**
- Validates SDK session.create/prompt APIs work correctly
- Verifies JSON envelope parsing works with real LLM output
- Tests PR comment publishing mechanism
- Catches integration issues early (before multi-model complexity)
- Reduces debugging surface area

**Implementation Location:**
Extend `ocdx_pr_review_loop` tool in `src/index.ts` with Phase B logic after Phase A summary.

**After Phase B Success:**
- Phase C: Extend to N reviewers (Promise.allSettled concurrency)
- Phase C: Add comments-analyzer
- Phase C: Implement consensus aggregation
- Phase D: Add fix loop


## [2026-01-25T19:20:00Z] Phase C Approach: Multi-Model + Consensus

### Strategy Decision
Extend Phase B single reviewer to full multi-model workflow with consensus:

**Phase C Goals:**
1. Run N reviewers concurrently (Promise.allSettled)
2. Add comments analyzer session
3. Aggregate all findings
4. Implement 5 consensus rules (deterministic)
5. Update PR comment with aggregated results

**Implementation Steps:**
1. Replace single reviewer call with Promise.allSettled loop over config.reviewerModels
2. Add comments-analyzer session call (load prompt, construct payload, parse result)
3. Aggregate findings from all reviewers + comments analyzer (no dedupe)
4. Compute total P0/P1/P2/P3 counts
5. Apply consensus rules 0-4 (Rule 0: reviewState, Rule 1-4: priority counts)
6. Update comment markdown to show ALL reviewers + aggregated consensus
7. Return success summary with consensus decision

**Concurrency Strategy:**
- Use `Promise.allSettled` (not `Promise.all`) for reviewers
- Allows partial execution if some reviewers fail
- Comments analyzer runs concurrently with reviewers
- If comments-analyzer fails → abort (cannot evaluate Rule 0)
- If 0 reviewers succeed → abort (cannot produce credible review)
- If ≥1 reviewer succeeds → proceed with partial aggregation

**Consensus Rules (Deterministic):**
- Rule 0: If reviewState.hasChangesRequested (from OWNER/MEMBER/COLLABORATOR) → request_changes
- Rule 1: Else if P0 > 0 → needs_major_work
- Rule 2: Else if P1 > 0 → request_changes
- Rule 3: Else if P2 > 0 → request_changes
- Rule 4: Else → approve

