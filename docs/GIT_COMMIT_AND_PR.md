# Git Commit and PR Command

统一的 Git 工作流命令，自动化 Issue 创建、Commit 和 PR 创建流程。

## 功能

- ✅ AI 生成的 commit message（符合 Conventional Commits 规范）
- ✅ AI 生成的 PR title 和 description
- ✅ 可选的 GitHub Issue 创建
- ✅ 自动检测分支状态和工作树
- ✅ 支持自定义模型
- ✅ 与 PR Review Loop 集成

---

## 用法

### 基本用法（自动检测）

```bash
/git-commit-and-pr
```

自动检测当前状态并执行所需阶段：

- 如果有未提交的修改 → 创建 commit
- 如果工作树干净且在功能分支 → 创建 PR

### 指定 Issue

```bash
/git-commit-and-pr --issue 123
```

关联已存在的 GitHub Issue #123。

### 仅创建 Issue

```bash
/git-commit-and-pr --issue-only
```

只创建 GitHub Issue，不执行 commit 或 PR 创建。

### 仅创建 PR

```bash
/git-commit-and-pr --pr --base main
```

只创建 PR（跳过 commit），指定 base 分支为 `main`。

### 指定模型

```bash
/git-commit-and-pr --model anthropic/claude-3-7-sonnet-20250219
```

使用自定义模型生成 commit message 和 PR description（优先级最高，会覆盖配置文件）。

如果不传 `--model`，会自动从项目配置读取：

- 优先使用 `.opencode/ocdx.json` 的 `models.low`
- 如果没配置 `models.low`，回退使用 `commentsAnalyzerModel`

**支持的模型格式：** `<provider>/<model-name>`

**示例：**

- `anthropic/claude-3-7-sonnet-20250219`
- `anthropic/claude-3-5-haiku-20241022` （默认）
- `openai/gpt-4-turbo`

---

## 参数

| 参数               | 类型      | 必需 | 说明                                                                                  |
| ------------------ | --------- | ---- | ------------------------------------------------------------------------------------- |
| `--issue <NUMBER>` | `number`  | ❌   | 关联已存在的 GitHub Issue ID                                                          |
| `--issue-only`     | `boolean` | ❌   | 仅创建 Issue，不执行 commit/PR                                                        |
| `--pr`             | `boolean` | ❌   | 仅创建 PR（跳过 commit）                                                              |
| `--base <BRANCH>`  | `string`  | ❌   | PR 的 base 分支（默认：master）                                                       |
| `--model <MODEL>`  | `string`  | ❌   | 覆盖使用的 AI 模型（默认：读 `models.low`，否则 `commentsAnalyzerModel`，否则 haiku） |

---

## 执行流程

### Step 1: 状态检测

并行执行：

```bash
git status --short
git branch --show-current
```

**分支检查：**

- ❌ 禁止在 `main`/`master` 分支直接提交
- ✅ 必须在功能分支上操作

### Step 2: Issue 创建（可选）

如果提供 `--issue-only` 或没有关联 Issue：

1. 分析当前对话历史和代码变更
2. 使用 AI 模型生成 Issue title 和 description
3. 通过 `gh issue create` 创建 GitHub Issue
4. 返回 Issue 编号和链接

### Step 3: Commit 流程

如果有未提交的修改：

#### 3.1 暂存变更

```bash
git add -A
git diff --cached
```

#### 3.2 生成 Commit Message

AI 分析 `git diff --cached` 内容，生成符合 Conventional Commits 规范的提交信息：

```
<type>: <summary>

Changes:
- <change 1>
- <change 2>

Refs: #<issue-id>
```

**Type 类型：**

- `feat` - 新功能
- `fix` - Bug 修复
- `refactor` - 重构
- `docs` - 文档更新
- `chore` - 构建/工具变更
- `test` - 测试相关

#### 3.3 提交

```bash
git commit -F <temp-file>
git log -1 --oneline
```

### Step 4: PR 创建

如果工作树干净且在功能分支：

#### 4.1 推送分支

```bash
git push -u origin HEAD
```

#### 4.2 分析变更

```bash
git log origin/<base>..HEAD --oneline
git diff origin/<base>...HEAD --stat
```

#### 4.3 生成 PR 内容

AI 分析提交历史和变更，生成：

- **Title**: `<type>: <summary>`
- **Body**: Markdown 格式，包含：
  - ## Changes 部分
  - ## Testing 清单
  - `Closes: #<issue-id>` 引用

#### 4.4 创建 PR

```bash
gh pr create --title '<title>' --body-file <temp-file> --base <base>
```

#### 4.5 提示后续操作

PR 创建成功后，提示运行自动审查：

```
💡 Next Step: Run automated code review

/pr-review-loop --pr <PR_NUMBER>
```

---

## 输出格式

### 成功（完整流程）

```
✅ Workflow Complete

Issue: #123
Commit: a1b2c3d
PR: #456 → https://github.com/owner/repo/pull/456

💡 Next Step: Run automated code review

/pr-review-loop --pr 456
```

### 仅 Issue

```
✅ Issue Created

Created issue #123: Add user authentication

Stop here as requested (--issue-only)
```

### 错误（在 main 分支）

```
❌ Error: Cannot commit directly to main

Please create a feature branch first:

git checkout -b feature/your-feature-name
```

### 失败

```
❌ Workflow Failed

Error: <error message>
```

---

## 使用场景

### 场景 1: 完整工作流（从代码到 PR）

```bash
# 1. 修改代码
vim src/auth.ts

# 2. 运行完整工作流
/git-commit-and-pr

# 输出:
# ✅ Workflow Complete
# Issue: #42
# Commit: abc123d
# PR: #43 → https://github.com/...
```

### 场景 2: 先创建 Issue，后续关联

```bash
# 1. 创建 Issue
/git-commit-and-pr --issue-only

# 输出: Issue #42 created

# 2. 开发完成后，关联 Issue
/git-commit-and-pr --issue 42
```

### 场景 3: 手动提交后创建 PR

```bash
# 1. 手动 commit
git add .
git commit -m "feat: add authentication"

# 2. 只创建 PR
/git-commit-and-pr --pr --base main
```

### 场景 4: 使用高质量模型

```bash
# 使用 Sonnet 生成更高质量的 commit message 和 PR description
/git-commit-and-pr --model anthropic/claude-3-7-sonnet-20250219
```

---

## 与 PR Review Loop 集成

完整的代码审查工作流：

```bash
# Step 1: 创建 PR
/git-commit-and-pr

# 输出: PR #123 created

# Step 2: 自动审查（推荐）
/pr-review-loop --pr 123
```

**集成优势：**

1. **AI 生成的 PR description** - 提供更好的上下文
2. **自动关联 Issue** - 追踪完整需求链
3. **标准化 commit** - 符合 Conventional Commits
4. **自动审查提示** - 无缝进入 review 流程

---

## 最佳实践

### 1. 分支命名规范

```bash
# 功能分支
git checkout -b feature/add-authentication
git checkout -b feature/user-profile

# Bug 修复分支
git checkout -b fix/login-error
git checkout -b fix/memory-leak

# 重构分支
git checkout -b refactor/api-client
```

### 2. 提交前检查

```bash
# 查看将要提交的内容
git diff

# 查看文件列表
git status
```

### 3. 模型选择

| 任务复杂度 | 推荐模型     | 说明           |
| ---------- | ------------ | -------------- |
| 简单修改   | `haiku`      | 快速、成本低   |
| 中等复杂度 | `sonnet-3.5` | 平衡质量和成本 |
| 复杂功能   | `sonnet-3.7` | 最高质量       |

### 4. Issue 关联

- **新功能** → 先创建 Issue，再关联
- **Bug 修复** → 关联已有 Issue
- **小改动** → 可省略 Issue

---

## 故障排查

### 问题 1: 提示 "Cannot commit directly to main"

**原因**: 正在 main/master 分支上操作

**解决**:

```bash
git checkout -b feature/your-feature-name
/git-commit-and-pr
```

### 问题 2: PR 创建失败

**原因**: 分支未推送或远程已存在 PR

**解决**:

```bash
# 检查远程分支
git push -u origin HEAD

# 检查是否已有 PR
gh pr list --head $(git branch --show-current)
```

### 问题 3: 模型调用失败

**原因**: 模型字符串格式错误或模型不可用

**解决**:

```bash
# 使用默认模型
/git-commit-and-pr

# 或指定可用模型
/git-commit-and-pr --model anthropic/claude-3-5-haiku-20241022
```

---

## 限制和注意事项

### 限制

- ❌ 必须在 Git 仓库中运行
- ❌ 必须配置 `gh` CLI 并认证
- ❌ 不能在 main/master 分支直接提交
- ❌ 需要有未提交的修改（除非使用 `--pr`）

### 注意事项

1. **AI 生成的内容需要审查**
   - Commit message 可能需要调整
   - PR description 可能遗漏关键信息

2. **临时文件清理**
   - 工具会自动清理临时文件
   - 清理失败不影响主流程

3. **分支权限**
   - 需要有推送到远程仓库的权限
   - 需要有创建 PR 的权限

---

## 相关命令

- `/pr-review-loop` - PR 自动审查和修复
- `gh pr create` - GitHub CLI 创建 PR
- `gh issue create` - GitHub CLI 创建 Issue

---

**最后更新:** 2026-01-25
