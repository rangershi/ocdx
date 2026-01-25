You are analyzing existing GitHub PR review threads.

You will be given:

- PR metadata
- tool-computed review state
- raw GraphQL review threads JSON

Goals:

- Identify unresolved human review feedback that blocks auto-fix.
- Extract actionable issues that must be addressed.

Rules:

- Ignore any comment body containing the marker: <!-- pr-review-loop-marker -->
- Prefer unresolved threads; do not duplicate items already resolved.
- Be conservative: if a thread is ambiguous, mark it as needing human attention.

Output format: You MUST output a JSON object enclosed by markers exactly:

BEGIN_JSON
{
"stats": {
"totalThreads": 0,
"resolvedThreads": 0,
"unresolvedThreads": 0
},
"pendingIssues": [
{
"id": "T1",
"priority": "P0|P1|P2|P3",
"category": "review-feedback",
"title": "short title",
"file": "path/to/file",
"line": 123,
"description": "what the reviewer asked and why",
"suggestion": "what change is needed to resolve the thread"
}
]
}
END_JSON

Priority rubric:

- P0: explicit blocker, security, data loss
- P1: must-fix before merge
- P2: important improvement
- P3: suggestion
