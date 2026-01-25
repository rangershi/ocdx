# OCDX PR Review Loop (Multi-Model)

## Context

### Original Request

Port the multi-round PR review + auto-fix workflow described by Appendix A in this plan (and to be vendored into `docs/pr-review-loop-reference.md` by TODO 0) into this OpenCode plugin (`/Users/a1/work/ocdx`).

Key changes vs the reference:

- LLM reviewers: configurable `1..5` models.
- `pr-comments-analyzer`: pinned to exactly `1` model.
- `pr-fix`: pinned to exactly `1` model.
- Model configuration lives in `~/.config/opencode/ocdx.json`.
- Validate config only when running `/pr-review-loop` (not at plugin load).
- Command flags: only `--pr <PR_NUMBER>`.
- Max rounds: `3`.
- Pre-push verification commands are fixed: `dx lint`, `dx build all`.

### Repo / System Reality

- Plugin code currently registers commands in `src/index.ts` via `opencodeConfig.command[...]`.
- OpenCode config schema supports:
  - `command.<name> = { template, description, agent, model, subtask }`
  - `agent.<name> = { mode, model, prompt, tools, permission, ... }`
  - Agent-level `model` pinning is the reliable mechanism for multi-model.

### Metis Review (Key Guardrails)

- Never force push; avoid destructive git operations.
- Validate `gh` auth before doing anything; fail with actionable message.
- Prevent infinite loop; hard cap rounds + detect recurring issues.
- Sanitize PR comments; avoid leaking secrets.
- Preflight verify `dx lint` and `dx build all` exist and are runnable.

---

## Work Objectives

### Core Objective

Provide an OpenCode command `/pr-review-loop` that orchestrates: PR detection, multi-model review, comment-thread analysis, consensus aggregation, GitHub comment publishing, auto-fix (commit + push), and up to 3 review/fix rounds.

### Concrete Deliverables

- Plugin registers a `/pr-review-loop` command.
- Plugin registers a custom tool `ocdx_pr_review_loop` that implements the full loop.
- The tool uses OpenCode SDK session APIs to run:
  - N reviewers (N = 1..5) with per-call model override
  - 1 comments-analyzer run with its configured model
  - 1 pr-fix run with its configured model
- Runtime config validation with clear, actionable error messages.
- Review report and fix report posted to the PR with `<!-- pr-review-loop-marker -->`.
- Operational note included: config is read at runtime; changes take effect on next run.
- Existing plugin behavior remains (default): keep current `hello` and `check_directory` tools/commands; add pr-review-loop alongside.

### Definition of Done

- Running `/pr-review-loop --pr <PR>` performs a full round: reviews + aggregation + PR comment.
- If P0/P1/P2 remain, it triggers `pr-fix`, runs `dx lint` and `dx build all`, pushes commits, and loops (max 3 rounds).
- On success (P0/P1/P2 == 0 and no unresolved comment threads), exits with a clear success message.
- On failure (config invalid, gh auth missing, PR not found, verification fails, max rounds reached), exits with clear reason and next steps.
- Plugin repo checks pass:
  - `pnpm run build`
  - `pnpm run lint`

### Must NOT Have (Guardrails)

- No `git push --force`.
- No writing secrets into PR comments.
- No silently skipping publishing review/fix reports.
- No infinite loops beyond 3 rounds.

---

## Verification Strategy

### Automated Tests

This plugin repo has no test harness configured. Treat this work as **manual QA** with repeatable command-based verification.

### Manual Verification Prerequisites

- `gh` CLI installed and authenticated: `gh auth status` succeeds.
- Working directory is a git repo with a PR branch checked out.
- The target repo contains `dx` CLI and supports:
  - `dx lint`
  - `dx build all`

---

## Config Contract

### File

`~/.config/opencode/ocdx.json`

### Schema (required)

```json
{
  "reviewerModels": ["provider/model"],
  "commentsAnalyzerModel": "provider/model",
  "prFixModel": "provider/model"
}
```

### Validation Rules

- File must exist and be valid JSON.
- `reviewerModels` is an array of strings, length `1..5`.
- `commentsAnalyzerModel` is a non-empty string.
- `prFixModel` is a non-empty string.
- Any violation => `/pr-review-loop` stops immediately with a schema example.

### Operational Note (Runtime Model Selection)

This workflow selects models at runtime using the OpenCode Session API model override (`SessionPromptData.body.model`).

Implications:

- `~/.config/opencode/ocdx.json` changes take effect on the next `/pr-review-loop` run (no OpenCode restart required).
- Config validation can happen inside the orchestrator tool before any PR actions.

---

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

---

## TODOs

### 0) Vendor the reference spec into this repo

**What to do**:

- Create a canonical reference spec file in this repo: `docs/pr-review-loop-reference.md`.
- Populate it by copy/pasting these sections from this plan (so the plan is self-contained and portable):
  - Task Flow
  - SDK-Based Orchestration
  - Consensus rules
  - Comment marker + publishing rules
  - Loop termination rules
  - Appendix A (Canonical Data Shapes)

Dependency:

- Treat this as a blocker: Tasks 2+ MUST NOT start until `docs/pr-review-loop-reference.md` exists.

Optional external cross-check (not authoritative):

- If available, compare against `/Users/a1/work/mydx/dx/commands/pr-review-loop.md` to catch drift.
- Optional (if available on the same machine): compare against the original source `/Users/a1/work/mydx/dx/commands/pr-review-loop.md` to ensure no rule drift.

Language policy:

- Chinese is acceptable for the reference doc, but keep the same headings/structure as Appendix A so the orchestrator prompts can reference it reliably.

**Parallelizable**: YES

**Acceptance Criteria**:

- The repo contains `docs/pr-review-loop-reference.md` and the plan references that file (not the absolute `/Users/...` path).

### 0a) Create prompt assets (tool-driven sessions)

**What to do**:

- Store the long-form prompts as repo files (so they are reviewable and not buried in TS string literals):
  - `src/prompts/pr-review-loop/reviewer.md`
  - `src/prompts/pr-review-loop/comments-analyzer.md`
  - `src/prompts/pr-review-loop/pr-fix.md`
- The `ocdx_pr_review_loop` tool loads these prompt files at the start of each run (using the `assetUrl(...)` helper). If any prompt is missing/unreadable, return an error before any PR actions.

**Parallelizable**: YES

**Acceptance Criteria**:

- Prompt files exist at the paths above.
- Each prompt file includes these non-negotiable instructions:
  - Output format MUST use `BEGIN_JSON` / `END_JSON` markers only.
  - Output JSON MUST match the shapes in Appendix A.
  - Reviewer/comments-analyzer MUST NOT paste full diffs.

### 0b) Ensure prompt/docs assets are shipped (packaging)

**What to do**:

- This repo builds to `dist/` via `tsc` and publishes only a subset of files.
- Update `package.json#files` to include at least:
  - `dist`
  - `src/version.ts` (existing)
  - `src/prompts` (new)
  - `docs/pr-review-loop-reference.md` (new)

Runtime asset path resolution (ESM-safe):

- From compiled `dist/index.js`, load assets using `import.meta.url`, e.g.:
  - `new URL('../src/prompts/pr-review-loop/reviewer.md', import.meta.url)`
  - `new URL('../src/prompts/pr-review-loop/comments-analyzer.md', import.meta.url)`
  - `new URL('../src/prompts/pr-review-loop/pr-fix.md', import.meta.url)`
  - `new URL('../docs/pr-review-loop-reference.md', import.meta.url)`

Supported execution modes (explicit):

- NPM-installed compiled plugin (default): `dist/index.js` exists; assets are shipped via `package.json#files` and loaded via `import.meta.url` as above.
- Local `.ts` plugin load (developer mode): paths still resolve via `import.meta.url` from the TypeScript module location; prompts/docs must exist in the workspace.

Deterministic helper (works from both `src/` and `dist/`):

- Implement a helper like `assetUrl(relFromRepoRoot: string): URL`:
  - `moduleDir = new URL('.', import.meta.url)`
  - `repoRoot = new URL('..', moduleDir)` (parent of `src/` or `dist/`)
  - `return new URL(relFromRepoRoot, repoRoot)`

Examples:

- From `dist/index.js`: `assetUrl('src/prompts/pr-review-loop/reviewer.md')` resolves to `<repo>/src/prompts/pr-review-loop/reviewer.md`.
- From `src/index.ts`: `assetUrl('src/prompts/pr-review-loop/reviewer.md')` resolves to `<repo>/src/prompts/pr-review-loop/reviewer.md`.

**Parallelizable**: YES

**Acceptance Criteria**:

- Packaging test:
  - Run `npm pack` in `/Users/a1/work/ocdx`.
  - Inspect tarball contains:
    - `package/dist/index.js`
    - `package/src/prompts/pr-review-loop/reviewer.md`
    - `package/src/prompts/pr-review-loop/comments-analyzer.md`
    - `package/src/prompts/pr-review-loop/pr-fix.md`
    - `package/docs/pr-review-loop-reference.md`
- Runtime smoke:
  - Install the tarball into a temp project and confirm the plugin can read one prompt file at startup (fail with clear message if missing).

### 0c) Ensure this plugin repo passes lint/build

**What to do**:

- `AGENTS.md` recommends `no-console`: error; treat `pnpm run lint` output as the source of truth for what must change.
- Replace/route logging through the OpenCode client logger (or remove noisy logs) so `pnpm run lint` passes.
- If `pnpm run lint` fails due to missing ESLint config:
- Add a minimal ESLint flat config at `eslint.config.js`.
  - Baseline: TypeScript + prettier integration; include `no-console: "error"`.

**Parallelizable**: YES

**Acceptance Criteria**:

- In `/Users/a1/work/ocdx`, `pnpm run lint` passes.
- In `/Users/a1/work/ocdx`, `pnpm run build` passes.

### 1) Add config loader + validator (runtime)

**What to do**:

- Implement a reusable helper in the plugin (example: `loadOcdxConfigStrict()`):
  - resolves config path via Node APIs (do not rely on shell `~` expansion):
    - `configPath = path.join(os.homedir(), '.config', 'opencode', 'ocdx.json')`
  - reads config from `configPath`
  - validates schema + constraints (including `reviewerModels.length <= 5`)
  - returns `{ reviewerModels: string[], commentsAnalyzerModel: string, prFixModel: string }` on success
  - throws (or returns) a structured error on failure with:
    - code
    - human message
    - absolute configPath
    - example JSON
- The main orchestrator tool (`ocdx_pr_review_loop`) MUST call this first and abort on error.

**Parallelizable**: YES

**References**:

- `src/index.ts` - current plugin entry; where `config` hook and command registration happens.
- `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts#L1016` - `Config.command` schema supports `agent/model/subtask`.

**Acceptance Criteria**:

- Missing file produces error including:
  - exact expected path
  - example JSON
- Invalid JSON produces error including parse failure context.
- `reviewerModels` empty or >5 produces error mentioning allowed range.

### 2) Implement `ocdx_pr_review_loop` tool (full orchestrator)

**What to do**:

- Add a plugin custom tool named `ocdx_pr_review_loop` with args:
  - `pr`: optional number
- This tool fully implements the loop described in Task Flow, using:
  - `gh` CLI for GitHub PR identification, metadata, diff, comments, and posting comments
  - `dx lint` and `dx build all` for verification
  - OpenCode SDK session APIs for multi-model LLM calls per role

Plugin integration prerequisite:

- Update `src/index.ts` to destructure `client` from the plugin input (`async ({ client, directory, $ }) => { ... }`) so the tool can call `client.session.create` / `client.session.prompt`.

**How multi-model calls work (concrete)**:

- For each reviewer model in `reviewerModels` (1..5):
  - `child = await client.session.create({ body: { parentID: ctx.sessionID, title: `reviewer-${i}` }, query: { directory } })`
  - `resp = await client.session.prompt({ path: { id: child.id }, query: { directory }, body: { model: { providerID, modelID }, agent: 'ocdx-reviewer', parts: [{ type: 'text', text: <reviewer prompt + PR context> }] } })`
  - Extract concatenated `text` from `resp.parts` where `type == 'text'`, then parse JSON envelope.
- For comments analyzer model and pr-fix model: same mechanism with role-specific prompts and tool permissions.

Model selection policy (deterministic):

- Do NOT set `opencodeConfig.agent.<role>.model` (leave unset) so plugin load does not depend on `~/.config/opencode/ocdx.json`.
- Always set the per-call model via `SessionPromptData.body.model = { providerID, modelID }` using the runtime config.

Model override verification (must-have):

- After each `client.session.prompt` call, verify the returned `AssistantMessage` matches the requested model:
  - Check `resp.info.providerID` and `resp.info.modelID` against the config string.
  - Reference: `AssistantMessage.providerID/modelID` in `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`.
- If mismatch:
  - treat as hard-fail (stop loop, publish error report, no pr-fix).

Concurrency + partial execution (deterministic):

- Use `Promise.allSettled` (not `Promise.all`) so one failed reviewer does not abort the whole round.
- Round failure policy:
  - If comments-analyzer fails (markers missing / JSON parse error / API error): stop immediately (cannot evaluate Rule 0 / unresolved threads reliably).
  - If at least 1 reviewer succeeds: proceed with partial aggregation; note failed reviewers in the report.
  - If 0 reviewers succeed: stop the loop (cannot produce credible review) and post a failure report (no fix attempt).
  - If pr-fix fails (markers missing / JSON parse error / tool errors): stop immediately.

Authoritative tool-permission mechanism (agent-level; concrete):

- Do NOT rely on `SessionPromptData.body.tools` semantics.
- Instead, enforce tool boundaries via `opencodeConfig.agent` definitions (docs: https://opencode.ai/docs/agents and https://opencode.ai/docs/tools):
  - Define agents in plugin `config` hook:
    - `ocdx-reviewer` (mode: subagent):
      - `tools`: `{ bash: true, read: true, grep: true, glob: true, edit: false }`
      - `permission.edit = 'deny'`
    - `ocdx-comments-analyzer` (mode: subagent):
      - `tools`: `{ bash: true, edit: false }`
      - `permission.edit = 'deny'`
    - `ocdx-pr-fix` (mode: subagent):
      - `tools`: `{ bash: true, read: true, grep: true, glob: true, edit: true }`
      - `permission.edit = 'allow'`
      - `permission.bash` guardrails (concrete):
        - Deny any force push:
          - `git push --force*` => deny
          - `git push -f*` => deny
        - Allow common safe commands:
          - `dx *` => allow
          - `git status*` => allow
          - `git diff*` => allow
          - `git add*` => allow
          - `git commit*` => allow
          - `git push*` => ask (but will never allow --force due to rules above)
  - Note: per docs, `write`/`patch` are controlled by the `edit` permission.
- In all `client.session.prompt` calls, set `body.agent` to the role agent name (`ocdx-reviewer`, `ocdx-comments-analyzer`, `ocdx-pr-fix`).

**Role prompt + context payloads (concrete, deterministic)**:

- Common PR context (generated by the tool and injected into every role prompt):
  - PR metadata JSON: `gh pr view <PR> --json number,title,url,baseRefName,headRefName`
  - File list JSON: `gh pr view <PR> --json files`
  - Diff text: `gh pr diff <PR> --color=never`
    - Truncation rule: if diff exceeds 4000 lines OR 200000 characters, include only the first 4000 lines and append a line `"[TRUNCATED_DIFF]"`.

- Reviewer prompt input must include:
  - common PR context (above)
  - instructions to run additional `gh`/file reads as needed
  - a hard rule: do not paste diffs into output

- Comments-analyzer prompt input must include:
  - common PR context (above)
  - GraphQL reviewThreads JSON (from the query in TODO 6)

- pr-fix prompt input must include:
  - common PR context (above)
  - the Fix Payload JSON (Appendix A)
  - explicit instruction: run `dx lint` and `dx build all` before pushing

**Machine-parseable JSON envelope (required)**:

- Every role response MUST be exactly:

```text
BEGIN_JSON
{ ...one JSON object matching Appendix A... }
END_JSON
```

- The tool extracts JSON via regex between `BEGIN_JSON` and `END_JSON` and runs `JSON.parse`.
- If markers are missing or parsing fails, mark that role as failed and continue ("partial"), except pr-fix which is a hard-fail.

**Parallelizable**: NO (this is the orchestration core)

**References**:

- `src/index.ts` - where to register plugin tools.
- `node_modules/@opencode-ai/plugin/dist/tool.d.ts` - tool execute returns `Promise<string>`.
- `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts#L1808` - `SessionCreateData`.
- `node_modules/.pnpm/@opencode-ai+sdk@1.1.34/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts#L2241` - `SessionPromptData`.

**Acceptance Criteria**:

- Tool returns a single Markdown string containing:
  - round-by-round summary
  - aggregated counts
  - links to PR
  - whether fixes were applied
- If config invalid/missing: tool returns an error message and performs no PR actions.
- Reviewers and comments analyzer run concurrently (use `Promise.allSettled`) and failures are reported as "partial".
- Validation ordering is explicit:
  - Validate config first; if invalid, do not run any `gh`/`git`/`dx` commands.

### 3) Add `/pr-review-loop` command registration

**What to do**:

- Register `opencodeConfig.command['pr-review-loop']` with:
  - `description`
  - `template`: a minimal prompt that calls the `ocdx_pr_review_loop` tool
- Support only `--pr <PR_NUMBER>` argument.

**Template + argument plumbing (concrete)**:

- OpenCode command templates support `$ARGUMENTS` and positional `$1`, `$2`, ... (see https://opencode.ai/docs/commands#arguments).
- Define the command template so the orchestrator always receives raw args:

```text
You are a command dispatcher.

Raw arguments: "$ARGUMENTS"

Rules:
- If $1 == "--pr": call tool `ocdx_pr_review_loop` with {"pr": parseInt($2)}
- Else if $1 is empty: call tool `ocdx_pr_review_loop` with {} (auto-detect)
- Else: print usage and stop

Usage:
  /pr-review-loop
  /pr-review-loop --pr <PR_NUMBER>

Do not do any other work besides calling the tool.
```

Dispatcher contract examples (verifiable):

- Input: `/pr-review-loop` -> exactly one tool call: `ocdx_pr_review_loop({})`
- Input: `/pr-review-loop --pr 123` -> exactly one tool call: `ocdx_pr_review_loop({"pr":123})`
- Input: `/pr-review-loop --pr` -> zero tool calls; prints usage
- Input: `/pr-review-loop foo` -> zero tool calls; prints usage

**Parallelizable**: NO (depends on 2)

**References**:

- `src/index.ts:123` - existing command registration pattern.

**Acceptance Criteria**:

- `/pr-review-loop --pr 123` results in a single call to `ocdx_pr_review_loop`.
- Unknown flags produce a help message (and do not proceed).
- Invalid arg cases produce usage and do not proceed:
  - `/pr-review-loop --pr` (missing number)
  - `/pr-review-loop --pr abc` (non-numeric)
  - `/pr-review-loop --pr 123 extra` (extra args)

### 4) Implement PR workflow inside `ocdx_pr_review_loop`

**What to do**:

- Implement the full workflow inside the tool (not in an LLM prompt):
  - Parse optional `pr` arg.
  - Preflight checks (ordered; fail fast):
    1. Validate `~/.config/opencode/ocdx.json` (no shell, no network). If invalid: return error immediately.

    2. `gh auth status`. If not authenticated: return error.
    3. Ensure we are in a git repo: `git rev-parse --is-inside-work-tree` returns `true`.
    4. `git status --porcelain` is empty (clean working tree). If dirty: return error.
    5. `git branch --show-current` (needed for auto-detect).
    6. Ensure `gh` can resolve a repo from this directory: `gh repo view --json nameWithOwner` succeeds.
    7. `dx` exists: `command -v dx`.

    8. Verify required dx subcommands exist (but do not require they pass):
       - `dx --help` output must contain both `lint` and `build`.
       - If missing, stop with error: "dx subcommands missing: need dx lint and dx build all".

    Note: do NOT require `dx lint` / `dx build all` to pass in preflight; the loop exists to fix issues that may cause them to fail.

  - Definition: "PR actions" = any `gh pr ...`, `gh api ...`, or `gh pr comment ...` call.

  - Shell failure policy (deterministic):
    - Any non-zero exit code from `gh`, `git`, or `dx` commands: stop immediately.
    - Before the first PR comment is posted: return error to the user (no PR comment).
    - After at least one PR comment has been posted in this run: post one final marker comment summarizing the failure and stop.

- Identify PR:
  - If arg provided: use that PR
  - Else: `gh pr list --head <branch> --json number,title,url`
  - Deterministic failure policy:
    - Detached HEAD / cannot determine branch: stop and print usage.
    - 0 PRs found for branch: stop and print usage.
    - 2+ PRs found for branch: stop and print the PR numbers/URLs; require explicit `--pr`.
    - If `gh pr view <PR> --json state` indicates closed/merged: stop (do not review/fix).
    - Wrong-branch detection (concrete):
      - Get PR head ref: `gh pr view <PR> --json headRefName --jq .headRefName`
      - Compare to `git branch --show-current`; if different: stop and instruct user to checkout the head ref.
      - Fork / cannot-push detection (concrete):
      - Determine base repo owner/name: `gh repo view --json nameWithOwner --jq .nameWithOwner` (split on `/`).
      - Fetch PR head repo + viewer permission via GraphQL:
        - `gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){headRefName headRepository{nameWithOwner viewerPermission}}}}' -F owner=<BASE_OWNER> -F repo=<BASE_REPO> -F pr=<PR>`
        - Set `canPush = true` only if `headRepository.viewerPermission` is one of {WRITE,MAINTAIN,ADMIN}.
        - If not, set `canPush = false` (review-only).
        - If this GraphQL call fails or returns incomplete data: set `canPush = false` and include the error in the report.
  - Gather PR metadata + file list for context.
  - Compute review-state for Consensus Rule 0 (deterministic; not LLM-based):
    - Preferred: `gh pr view <PR> --json reviews` and parse fields if present.
    - Fallback (if `authorAssociation` / `author.login` fields are missing): use GraphQL:
      - `gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviews(first:100){nodes{state author{login} authorAssociation}}}}}' -F owner=<OWNER> -F repo=<REPO> -F pr=<PR>`
    - Compute:
      - `hasChangesRequested = true` if ANY review has:
        - `state == "CHANGES_REQUESTED"` AND `authorAssociation` in {OWNER,MEMBER,COLLABORATOR}
      - `changesRequestedBy = unique list of {login, association}` for those reviews

  - Source of truth for `reviewState`:
    - The tool's computed `reviewState` is authoritative.
    - Pass this `reviewState` JSON into the comments-analyzer prompt and require it to echo the same value.
    - If the comments-analyzer output `reviewState` differs, overwrite it with the tool-computed value and note the mismatch in the report.

- Round loop (max 3):
  - Run reviewers concurrently via `client.session.create` + `client.session.prompt` (one session per reviewer model).
  - Run comments analyzer concurrently (one session, pinned to `commentsAnalyzerModel`).
    - Parse JSON envelopes (Appendix A shapes), aggregate findings, compute consensus.
    - Post review report via `gh pr comment` (sanitized; includes marker).
    - If needs fix:
      - If `canPush == false`: skip pr-fix; publish review-only note and exit after round 1.
      - Else run pr-fix session (pinned to `prFixModel`), then enforce verification by running `dx lint` + `dx build all` in the tool, then post fix report.
  - Unresolved human review thread policy (deterministic):
    - If comments analyzer reports `unresolvedThreads > 0`, do NOT include thread Findings in `issuesToFix` (they are informational blockers).
    - If `unresolvedThreads > 0` AND there are code Findings to fix, the tool may run pr-fix for code Findings, but MUST exit after publishing the fix report with a "manual resolution required" note.
    - If `unresolvedThreads > 0` AND there are NO code Findings, publish the review report and exit immediately (manual resolution required).
  - Exit on success criteria or max rounds.

**References**:

- Appendix A (this plan) is the source of truth; `docs/pr-review-loop-reference.md` is a vendored copy.

**Acceptance Criteria**:

- Publishes PR comment after each review round and after each fix round, each containing `<!-- pr-review-loop-marker -->`.
- Never uses force push.
- Stops after 3 rounds with a clear "max rounds reached" message listing remaining P0/P1/P2.

### 4a) Consensus rules for N reviewers (+ comments)

**What to do**:

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

**Parallelizable**: NO

**References**:

- Appendix A (this plan) is the source of truth; `docs/pr-review-loop-reference.md` is a vendored copy.

**Acceptance Criteria**:

- Consensus computation is deterministic and printed in the PR report.

### 4b) Comment publishing + sanitization policy

**What to do**:

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

**Acceptance Criteria**:

- Orchestrator never posts `diff --git` content in PR comments.
- If secret-like patterns appear in agent output, they are replaced with `[REDACTED]` before posting.

### 5) Reviewer agent output contract (JSON + markdown)

**What to do**:

- Standardize reviewer agent outputs to a strict JSON envelope (embedded in their response) containing:
  - agent name
  - prNumber
  - issues counts
  - findings array with stable IDs
  - fullReport markdown
- Ensure orchestrator can parse it reliably; add fallback behavior on parse failure.
- Finding ID strategy (deterministic; required for stuck detection):
  - Reviewers MUST generate `finding.id` as:
    - `CAT-<sha1>` where `CAT` is an uppercase short category (e.g. `SEC`, `PERF`, `QUAL`)
    - `<sha1>` is the first 8 hex chars of SHA-1 of: `${category}|${file}|${line ?? ''}|${title}`
  - If `line` is null, use empty string.
- Large diff handling (deterministic):
  - Reviewer must fetch file list first: `gh pr view <PR> --json files --jq '.files[].path'`.
  - Reviewer may fetch the diff via `gh pr diff <PR>` for analysis, but MUST NOT paste it into output.
  - If `gh pr diff <PR>` output exceeds 4000 lines, reviewer must:
    - only deep-dive up to 10 files (prioritize files mentioned in review threads first; else take the first 10 from file list)
    - call out that the review is "large-diff sampled" in the JSON envelope.

**Parallelizable**: YES

**Acceptance Criteria**:

- If a reviewer returns invalid JSON, orchestrator reports that reviewer as failed and continues with remaining reviewers (default) while noting reduced confidence.

### 6) Comments analyzer behavior

**What to do**:

- Analyze PR comment threads and extract unresolved items.
- Filter out any comment containing `<!-- pr-review-loop-marker -->`.
- Map unresolved items into Finding shape.

**GitHub acquisition (concrete commands)**:

- Determine repo owner/name:
  - `gh repo view --json nameWithOwner --jq .nameWithOwner`
- Fetch PR review state (to support Consensus Rule 0):
  - `gh pr view <PR> --json reviews --jq '.reviews[] | {state: .state, login: .author.login, association: .authorAssociation}'`
- Fetch unresolved review threads (GraphQL; supports isResolved + path/line):
  - Use this concrete query as a base (see deterministic pagination rules below):

```bash
gh api graphql \
  -F owner="<OWNER>" \
  -F repo="<REPO>" \
  -F pr=<PR> \
  -f query='query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 50) {
              nodes {
                id
                body
                author { login }
                authorAssociation
                path
                line
              }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            state
            author { login }
            authorAssociation
          }
        }
      }
    }
  }'
```

Pagination (deterministic):

- Implement a cursor loop for `reviewThreads`:
  - Query shape must include `reviewThreads(pageInfo { hasNextPage endCursor } nodes { ... })`.
  - Start with `cursor = null`.
  - Fetch up to `MAX_PAGES = 3` pages (i.e., up to 300 threads).
- If `hasNextPage` is still true after MAX_PAGES:
  - set `threadsTruncated = true` in the Comments Analyzer Result (Appendix A3)
  - treat the PR as "blocked" (do not run pr-fix; publish review report + exit)

Concrete paginated query + invocation contract:

```bash
QUERY='query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          comments(first: 50) {
            nodes {
              id
              body
              author { login }
              authorAssociation
              path
              line
            }
          }
        }
      }
    }
  }
}'

# First page (no cursor)
gh api graphql -f query="$QUERY" -F owner="<OWNER>" -F repo="<REPO>" -F pr=<PR>

# Next pages
gh api graphql -f query="$QUERY" -F owner="<OWNER>" -F repo="<REPO>" -F pr=<PR> -F cursor="<END_CURSOR>"
```

**Mapping rule**:

- For each thread where `isResolved == false`, create a Finding:
  - `id`: `THREAD-<firstCommentId>` (stable across reruns)
  - `priority`: P0 if `authorAssociation` in {OWNER,MEMBER,COLLABORATOR} and body contains "must" / "block" keywords; else P1
  - `file`: `path` if present else `"(no-path)"`
  - `line`: `line` if present else null
  - `description`: include the first 200 chars of comment body (sanitized)

**Parallelizable**: YES

**Acceptance Criteria**:

- Unresolved human threads are reflected in aggregated P0/P1/P2 counts and can block convergence.

### 7) pr-fix payload + fix verification

**What to do**:

- Construct fix payload containing:
  - prNumber
  - round
  - issuesToFix (all P0/P1/P2 Findings)
  - optionalIssues (P3)
- Require pr-fix output JSON with:
  - fixedIssues + rejectedIssues exhaustively accounting for issuesToFix
  - commits list
- Run fixed verification commands before push:
  - `dx lint`
  - `dx build all`
- Verify push created new commits on PR branch.

**Responsibility split (explicit)**:

- pr-fix session (LLM) responsibilities:
  - apply code edits
  - run `dx lint` and `dx build all` (must pass) BEFORE pushing
  - create commits
  - push to the PR head branch (no force)
- Orchestrator responsibilities:
  - never edit code
  - verify commits increased / head SHA changed
  - enforce verification by re-running `dx lint` and `dx build all` after pr-fix completes; if either fails, stop and report
  - publish fix report

**Concrete verification commands (orchestrator)**:

- Before fix:
  - `gh pr view <PR> --json commits --jq '.commits | length'`
  - `gh pr view <PR> --json commits --jq '.commits[-1].oid'`
- After fix:
  - same two commands; require (count increases OR head oid changes) when `fixed > 0`

**Parallelizable**: NO

**Acceptance Criteria**:

- If `dx lint` or `dx build all` fails, orchestrator:
  - publishes a fix report indicating verification failure
  - stops the loop early (do not start the next round)

---

## Defaults Applied (disclosed)

- If any reviewer fails to return parseable JSON: continue with remaining reviewers and mark the round as "partial" in the PR comment.
- Do not deduplicate findings (match reference behavior) but group by priority in the report.

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

## Success Criteria

### Manual End-to-End

1. Create a test PR (or choose a safe PR).
2. Ensure `~/.config/opencode/ocdx.json` is present and valid.
3. Run:

```bash
/pr-review-loop --pr <PR_NUMBER>
```

Expected:

- Review report comment posted.
- If fixes needed: fix commits pushed and fix report comment posted.
- Loop ends within 3 rounds.

---

## Appendix A: Canonical Data Shapes (Source for docs/pr-review-loop-reference.md)

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

---

## Appendix B: Canonical Prompt Templates (Copy into src/prompts/pr-review-loop/\*)

These templates are designed to be pasted into the prompt asset files created in TODO 0a.

### B1) reviewer.md

```text
You are a senior code reviewer.

You are given:
- PR metadata JSON
- PR file list JSON
- PR diff text (may be truncated)

You may run additional read-only commands (gh/git) to gather context, but:
- DO NOT paste full diffs into your output.

You must return EXACTLY one JSON envelope between markers, with NO extra text:

BEGIN_JSON
{
  "agent": "reviewer-<N>",
  "prNumber": <PR_NUMBER>,
  "conclusion": "approve|request_changes|needs_major_work",
  "issues": { "p0_blocking": 0, "p1_critical": 0, "p2_important": 0, "p3_suggestion": 0 },
  "findings": [
    {
      "id": "SEC-<8hex>",
      "priority": "P0|P1|P2|P3",
      "category": "security|performance|quality|architecture|testing|docs|other",
      "file": "path",
      "line": 0,
      "title": "...",
      "description": "...",
      "suggestion": "...",
      "source": { "type": "agent", "name": "reviewer-<N>", "reviewId": null, "timestamp": "<ISO8601>" }
    }
  ],
  "fullReport": "Markdown (no diffs)"
}
END_JSON

Finding ID rules:
- Use `CAT-<sha1>` where CAT is short uppercase category (SEC/PERF/QUAL/ARCH/etc).
- sha1 = first 8 hex chars of SHA-1(category|file|line|title). If line is null, use empty string.
```

### B2) comments-analyzer.md

```text
You analyze GitHub PR review threads.

You are given:
- PR metadata JSON
- PR file list JSON
- GraphQL JSON containing pullRequest.reviewThreads(nodes{isResolved,comments{nodes{id,body,author{login},authorAssociation,path,line}}})
- reviewState JSON computed by the orchestrator (echo it unchanged)

Rules:
- Identify unresolved threads (isResolved == false).
- Ignore any comment body containing the marker: <!-- pr-review-loop-marker -->
- Convert unresolved threads into Finding entries.
- Do NOT paste full diffs.

Return EXACTLY one JSON envelope between markers, with NO extra text:

BEGIN_JSON
{
  "agent": "comments-analyzer",
  "prNumber": <PR_NUMBER>,
  "reviewState": { "hasChangesRequested": false, "changesRequestedBy": [] },
  "stats": { "totalThreads": 0, "resolvedThreads": 0, "unresolvedThreads": 0 },
  "threadsTruncated": false,
  "issues": { "p0_blocking": 0, "p1_critical": 0, "p2_important": 0, "p3_suggestion": 0 },
  "pendingIssues": [
    {
      "id": "THREAD-<firstCommentId>",
      "priority": "P0|P1|P2|P3",
      "category": "review-thread",
      "file": "path",
      "line": 0,
      "title": "Unresolved review thread",
      "description": "...",
      "suggestion": "...",
      "source": { "type": "human", "name": "<login>", "reviewId": "<commentId>", "timestamp": "<ISO8601>" }
    }
  ],
  "fullReport": "Markdown summary"
}
END_JSON
```

### B3) pr-fix.md

```text
You are an auto-fix agent. Your goal is to fix the provided issues on the PR head branch.

You are given:
- PR metadata JSON
- PR file list JSON
- PR diff text (may be truncated)
- Fix Payload JSON (issuesToFix + optionalIssues)

Hard rules:
- Apply edits to fix issuesToFix in priority order P0 > P1 > P2.
- Run these commands and ensure they pass BEFORE pushing:
  - dx lint
  - dx build all
- Create atomic commits with descriptive messages.
- Push to the PR head branch without force.
- Do not leak secrets.

Return EXACTLY one JSON envelope between markers, with NO extra text:

BEGIN_JSON
{
  "agent": "pr-fix",
  "prNumber": <PR_NUMBER>,
  "summary": { "fixed": 0, "rejected": 0, "deferred": 0 },
  "fixedIssues": [{ "findingId": "SEC-001", "commitSha": "abcdef0", "description": "..." }],
  "rejectedIssues": [{ "findingId": "SEC-002", "reason": "..." }],
  "commits": [{ "sha": "abcdef0", "message": "fix: ..." }]
}
END_JSON

Invariant:
- fixedIssues.length + rejectedIssues.length MUST equal issuesToFix.length.
```

---

## Appendix C: Minimal ESLint 9 Flat Config (eslint.config.js)

If this repo lacks ESLint config and `pnpm run lint` fails with "No config found", use this as a baseline.

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-console': 'error',
    },
  },
];
```
