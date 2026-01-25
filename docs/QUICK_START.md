# OCDX Quick Start

快速开始使用 OCDX PR Review Loop。

## 1️⃣ 创建配置文件

在你的项目根目录：

```bash
mkdir -p .opencode
cat > .opencode/ocdx.json <<'EOF'
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219"
}
EOF
```

## 2️⃣ 运行审查

```bash
/pr-review-loop --pr 123
```

就这么简单！🎉

---

## 🎨 自定义提示词（可选）

### 使用内置示例

```json
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/strict-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

### 可用的提示词模板

#### Reviewer（审查员）

- `default-reviewer.md` - 通用审查
- `security-focused-reviewer.md` - 安全重点
- `performance-reviewer.md` - 性能优化
- `react-reviewer.md` - React/Next.js
- `typescript-reviewer.md` - TypeScript 严格
- `team-standards-reviewer.md` - 团队规范

#### Comments Analyzer（评论分析）

- `default-analyzer.md` - 通用分析
- `strict-analyzer.md` - 严格模式
- `collaborative-analyzer.md` - 协作友好

#### PR Fix（自动修复）

- `default-fix.md` - 通用修复
- `conservative-fix.md` - 保守策略
- `aggressive-fix.md` - 激进策略
- `safe-refactor-fix.md` - 安全重构

---

## 📚 详细文档

- [配置指南](./CONFIGURATION.md) - 完整配置说明
- [提示词示例](./prompt-examples/README.md) - 所有提示词详解
- [PR Review Loop 参考](./pr-review-loop-reference.md) - 工作原理

---

**提示：** 配置文件可以放在以下任一位置：

1. `.opencode/ocdx.json` ← 推荐（项目级）
2. `ocdx.json` ← 项目根目录
3. `~/.config/opencode/ocdx.json` ← 全局配置
