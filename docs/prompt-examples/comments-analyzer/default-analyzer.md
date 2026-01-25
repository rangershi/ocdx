# Default Comments Analyzer Prompt

<!-- 默认评论分析器提示词 -->

**使用场景：** 通用 PR 评论分析，适用于大多数协作场景

**适用项目：** 所有类型的项目

## 配置方法

```json
{
  "prompts": {
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/default-analyzer.md"
  }
}
```

---

## Prompt Content

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

---

## 说明 (Chinese)

这是默认的评论分析器提示词，从 `src/prompts/pr-review-loop/comments-analyzer.md` 复制而来。

**功能：**

- 识别未解决的 GitHub PR 评论线程
- 忽略自动生成的评论（带标记）
- 转换为结构化的 Finding 条目
- 统计线程状态

**输出结构：**

- `stats`: 总线程数、已解决、未解决
- `pendingIssues`: 未解决问题列表
- `reviewState`: GitHub 官方 review 状态

**建议：** 如果你需要更严格或更宽松的评论处理策略，请使用专项提示词。
