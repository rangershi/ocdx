# OCDX OpenCode Plugin

这是一个可安装的 OpenCode 插件（npm 包名：`opencode-hello-world`），提供两个主要 slash 命令：

- `/pr-review-loop`：多模型 PR Review + 自动修复 loop
- `/ocdx`：从项目内 `.opencode/skills` 选择并按模型分层执行 SKILL.md

README 分两部分：

- 使用者（OpenCode 用户）快速上手
- 开发者（维护/发布）说明

---

## 使用者快速上手（OpenCode 用户）

### 1) 安装插件

在你的项目 `opencode.json` 加上插件：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-hello-world"]
}
```

说明：OpenCode 会在启动时用 Bun 自动安装 `plugin` 列表里的 npm 包。

### 2) 配置 OCDX（必需）

在项目根目录创建 `.opencode/ocdx.json`（参考：`docs/CONFIGURATION.md`）：

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

### 3) 使用命令

PR Review Loop：

```bash
/pr-review-loop
/pr-review-loop --pr <PR_NUMBER>
```

运行项目内 skills：

```bash
/ocdx
/ocdx <keyword>
```

### 4) 添加 project skills（可选）

放到：`.opencode/skills/<name>/SKILL.md`

```md
---
name: my-skill
description: Do something useful
model: high
---

...skill instructions...
```

`model` 支持：

- `high|medium|low`：映射到 `.opencode/ocdx.json` 的 `models.*`
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

- `docs/QUICK_START.md`
- `docs/CONFIGURATION.md`
- `docs/pr-review-loop-reference.md`
- OpenCode Plugins: https://opencode.ai/docs/plugins/

## License

MIT
