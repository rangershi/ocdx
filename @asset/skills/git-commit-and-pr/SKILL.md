---
name: git-commit-and-pr
description: 统一 Git 工作流（OCDX skill）：基于仓库状态(可选)创建 Issue、生成规范提交、并创建 PR。
model: medium
allowed-tools: Bash, Read, Grep, Glob, Edit
---

# Git Commit + PR

## 用法

通过 OCDX skill runner 运行：

```bash
/ocdx git-commit-and-pr
```

说明：

- `/ocdx` 目前不会把 flags 传入 skill：需要在对话里按提示提供 Issue 编号/标题等信息。
- 禁止在 `main`/`master` 直接提交。

---

## 执行流程

### Step 1: 状态检测

并行执行（分成 3 个 Bash tool call，真并行，不要串行）：

```bash
git status --short
git branch --show-current
git log -1 --format='%H %s' 2>/dev/null || echo "no-commits"
```

根据状态决定阶段：

- 当前分支是 `main`/`master` -> 禁止提交 -> 先切到功能分支。
- 有未提交修改 -> 执行 Commit 流程。
- 工作树干净且在功能分支 -> 执行 PR 创建。
- Issue 是可选的：如果用户提供 Issue 编号，则在 commit/PR 中引用。

---

### Step 2: 确保功能分支

如果当前分支是 `main`/`master`，创建并切换：

```bash
git switch -c <branch-name>
```

分支命名建议：

- `feat/<short-slug>`
- `fix/<short-slug>`
- `chore/<short-slug>`

---

### Step 3: Issue 创建（可选）

如果用户没有 Issue 编号但希望创建：

1. 获取变更范围：

```bash
git diff --stat
```

2. 使用 GitHub CLI 创建 Issue（推荐）：

```bash
gh issue create --title "<title>" --body "<diff --stat + user notes>"
```

如果 `gh` 不可用/未登录：让用户提供 Issue URL/编号，或者跳过该步骤。

`issue-only` 场景：如果用户只需要 Issue，创建完成后在此终止。

---

### Step 4: Commit 流程

#### 4.1 暂存变更

```bash
git add -A
git diff --cached --stat
```

#### 4.2 生成提交

分析 `git diff --cached`，生成 commit message（不要提交 secrets / .env / credentials）：

```bash
git commit -F - <<'EOF'
<type>: <subject>

变更说明：
- <item 1>
- <item 2>

Refs: #<issue-id>
EOF
```

type: `feat` / `fix` / `refactor` / `docs` / `chore` / `test`

如果没有 Issue，省略 `Refs: ...`。

#### 4.3 确认提交

```bash
git status
git log -1 --oneline
```

---

### Step 5: PR 创建

#### 5.1 推送分支

```bash
git push -u origin HEAD
```

如果环境对 `git push` 触发确认：只问用户一次，得到明确同意后再继续。

#### 5.2 选择 base 分支

默认优先 `main`，否则使用 `master`：

```bash
base=main
git show-ref --quiet "refs/remotes/origin/$base" || base=master
echo "$base"
```

#### 5.3 分析变更

```bash
git log "origin/$base"..HEAD --oneline
git diff "origin/$base"...HEAD --stat
```

#### 5.4 创建 PR

使用 GitHub CLI（推荐）：

```bash
gh pr create --base "$base" --title "<type>: <subject>" --body-file - <<'EOF'
## 变更说明

- <item>

## 测试

- [ ] 本地测试通过

Closes: #<issue-id>
EOF
```

如果没有 Issue，省略 `Closes: ...`。

如果 `gh` 不可用/未登录：输出清晰的手动步骤（去 GitHub -> New PR -> base=$base -> compare=当前分支）。

#### 5.5 提示自动评审

PR 创建成功后提醒：

```bash
/pr-review-loop --pr <PR_NUMBER>
```

---

## 输出格式

成功：

```
✅ 完成

Issue: #<编号> <标题>
Commit: <hash> <主题>
PR: #<编号> -> <URL>

💡 下一步：/pr-review-loop --pr <编号>
```

部分完成：

```
⚠️ 停止于 <阶段>

已完成：<列表>
阻塞：<原因>
继续：/ocdx git-commit-and-pr
```
