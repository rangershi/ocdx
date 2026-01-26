# OCDX OpenCode Plugin

这是一个可安装的 OpenCode 插件（npm 包名：`ocdx`），提供两个主要 slash 命令：

- `/pr-review-loop`：多模型 PR Review + 自动修复 loop
- `/ocdx`：从项目内 `.opencode/skills` 选择并按模型分层执行 SKILL.md

README 分两部分：

- 使用者（OpenCode 用户）快速上手
- 开发者（维护/发布）说明

---

## 使用者快速上手（OpenCode 用户）

你只需要在项目的 `opencode.json` 里声明插件即可：OpenCode 会在启动时用 Bun 自动安装 npm 插件。

### 1) 安装插件

在你的项目 `opencode.json` 加上插件：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["ocdx"]
}
```

说明：OpenCode 会在启动时用 Bun 自动安装 `plugin` 列表里的 npm 包（缓存到 `~/.cache/opencode/node_modules/`）。

安装后你会获得两个 slash 命令：

- `/pr-review-loop`
- `/ocdx`

OpenCode 插件机制参考：https://opencode.ai/docs/plugins/

### 1.1) 运行前置条件（/pr-review-loop 必需）

`/pr-review-loop` 会调用外部 CLI（见 `src/pr-review-loop/preflight.ts` 的 preflight 检查），因此你需要：

- 已安装并登录 GitHub CLI：`gh auth login`
- 已安装 `dx` CLI，并且至少包含 `dx lint`、`dx build` 子命令
- 在一个 git 仓库内运行
- 工作区必须干净（`git status --porcelain` 为空）
- 必须在一个真实分支上（不能 detached HEAD）

### 2) 配置 OCDX（必需）

推荐在项目根目录创建 `.opencode/ocdx/config.json`：

- 这是“项目级配置”，优先级最高
- 如果没有项目级配置，会回退到全局配置 `~/.config/opencode/ocdx/config.json`（或 `XDG_CONFIG_HOME`）
- 如果两者都不存在，会使用插件内置默认值（见 `@asset/config.json`）

```json
{
  "models": {
    "high": "anthropic/claude-3-7-sonnet-20250219",
    "medium": "anthropic/claude-3-5-sonnet-20241022",
    "low": "anthropic/claude-3-5-haiku-20241022"
  },
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-5-haiku-20241022",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219"
}
```

字段说明（最常用）：

- `reviewerModels`：1-5 个 reviewer 模型（会并行跑）
- `commentsAnalyzerModel`：评论线程分析模型（用于判断是否存在未解决的人类 review 阻塞项）
- `prFixModel`：自动修复模型
- `models.high|medium|low`：给 `/ocdx` skills 使用的 tier 映射（可选）
- `prompts.*`：覆盖默认 prompt（可选；默认使用插件内置 prompt）

### 3) 使用命令

PR Review Loop：

```bash
/pr-review-loop
/pr-review-loop --pr <PR_NUMBER>
```

说明：

- 不传 `--pr` 时会尝试从当前分支自动检测 PR
- preflight 不通过时会直接给出可执行的错误提示（例如 `gh` 未登录、`dx` 不存在、工作区不干净等）

运行项目内 skills：

```bash
/ocdx
/ocdx <keyword>
```

说明：

- `/ocdx` 会在以下路径查找 SKILL.md（项目级优先于全局）：
  - 项目级：`.opencode/ocdx/skills/<name>/SKILL.md`
  - 全局：`~/.config/opencode/ocdx/skills/<name>/SKILL.md`（或 `XDG_CONFIG_HOME`）
- `/ocdx <keyword>` 会用关键字过滤技能（name/description）

### 4) 添加 project skills（可选）

放到（项目级）：`.opencode/ocdx/skills/<name>/SKILL.md`

放到（全局）：`~/.config/opencode/ocdx/skills/<name>/SKILL.md`

```md
---
name: my-skill
description: Do something useful
model: high
---

...skill instructions...
```

`model` 支持：

- `high|medium|low`：映射到 `.opencode/ocdx/config.json` 的 `models.*`
- `provider/model`：直接指定模型

---

## 开发者说明（维护/发布）

### 本地开发

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run format:check
```

### 打包（生成 tgz）

`prepack` 会自动 `clean + build`，保证 `dist/` 存在：

```bash
pnpm pack
```

### 发布到 npm

```bash
pnpm publish
```

发布前建议检查包内容：

```bash
npm pack --dry-run
```

### 插件暴露的工具/子代理（给开发者定位问题用）

- tools：`ocdx_pr_review_loop`、`ocdx_list_skills`、`ocdx_run_skill`、`check_directory`
- commands：`/pr-review-loop`、`/ocdx`
- subagents：`ocdx-reviewer`、`ocdx-comments-analyzer`、`ocdx-pr-fix`、`ocdx-skill-runner`

---

## 参考文档

- `docs/pr-review-loop-reference.md`
- OpenCode Plugins: https://opencode.ai/docs/plugins/

## License

MIT
