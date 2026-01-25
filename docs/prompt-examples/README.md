# 提示词示例集合

本目录包含各种场景下的提示词（prompt）示例，帮助你自定义 `/pr-review-loop` 命令的行为。

## 📂 目录结构

```
docs/prompt-examples/
├── README.md                           # 本文件
├── reviewer/                           # 代码审查员提示词示例
│   ├── default-reviewer.md            # 默认提示词（参考）
│   ├── security-focused-reviewer.md   # 安全重点审查
│   ├── performance-reviewer.md        # 性能优化审查
│   ├── react-reviewer.md              # React 专项审查
│   ├── typescript-reviewer.md         # TypeScript 严格审查
│   └── team-standards-reviewer.md     # 团队编码规范
├── comments-analyzer/                  # 评论分析器提示词示例
│   ├── default-analyzer.md            # 默认提示词（参考）
│   ├── strict-analyzer.md             # 严格分析未解决问题
│   └── collaborative-analyzer.md      # 协作友好分析
└── pr-fix/                             # 自动修复器提示词示例
    ├── default-fix.md                 # 默认提示词（参考）
    ├── conservative-fix.md            # 保守修复策略
    ├── aggressive-fix.md              # 激进修复策略
    └── safe-refactor-fix.md           # 安全重构修复

```

## 🚀 快速开始

### 1. 选择适合的提示词

浏览各个子目录，选择最符合你需求的提示词模板。

### 2. 创建配置文件

**方式 A：项目级别配置（推荐）**

在你的项目根目录创建配置文件，这样配置只对当前项目生效：

```bash
# 在项目根目录下创建配置
mkdir -p .opencode
cat > .opencode/ocdx.json <<EOF
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/default-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
EOF
```

**方式 B：全局配置**

如果你想所有项目共享同一个配置：

```bash
# 创建全局配置目录
mkdir -p ~/.config/opencode/prompts

# 复制提示词到全局目录
cp docs/prompt-examples/reviewer/security-focused-reviewer.md \
   ~/.config/opencode/prompts/my-reviewer.md

# 创建全局配置文件
cat > ~/.config/opencode/ocdx.json <<EOF
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "~/.config/opencode/prompts/my-reviewer.md",
    "commentsAnalyzer": "~/.config/opencode/prompts/my-analyzer.md",
    "prFix": "~/.config/opencode/prompts/my-fix.md"
  }
}
EOF
```

**配置文件查找顺序（优先级从高到低）：**

1. `<项目根目录>/.opencode/ocdx.json` ← **优先使用**
2. `<项目根目录>/ocdx.json`
3. `~/.config/opencode/ocdx.json` ← **全局 fallback**

### 3. 测试

```bash
/pr-review-loop --pr 123
```

### 💡 提示词路径支持

在配置文件中，提示词路径支持三种格式：

| 路径格式      | 示例                                                         | 说明                   |
| ------------- | ------------------------------------------------------------ | ---------------------- |
| **相对路径**  | `docs/prompt-examples/reviewer/security-focused-reviewer.md` | 相对于**项目根目录**   |
| **绝对路径**  | `/Users/you/custom-prompts/my-reviewer.md`                   | 完整文件路径           |
| **Home 路径** | `~/.config/opencode/prompts/my-reviewer.md`                  | `~` 自动展开为用户目录 |

**推荐实践：**

- 项目级配置使用**相对路径**（方便团队共享）
- 全局配置使用 **Home 路径**（不同机器通用）

## 📖 提示词说明

### 代码审查员 (Reviewer)

审查 PR 中的代码变更，识别问题并提出改进建议。

**关键要素：**

- 审查标准和优先级
- 关注领域（安全、性能、可维护性等）
- 输出格式要求（JSON schema）

**推荐场景：**

- `security-focused-reviewer.md` - 适合金融、医疗等安全敏感项目
- `performance-reviewer.md` - 适合高性能要求的应用
- `react-reviewer.md` - 适合 React/Next.js 项目
- `typescript-reviewer.md` - 适合 TypeScript 严格类型项目
- `team-standards-reviewer.md` - 适合有明确编码规范的团队

### 评论分析器 (Comments Analyzer)

分析 GitHub PR 中的评论和讨论线程，识别待解决的问题。

**关键要素：**

- 未解决线程识别规则
- 优先级判定标准
- 评论分类逻辑

**推荐场景：**

- `strict-analyzer.md` - 适合严格的审查流程
- `collaborative-analyzer.md` - 适合开放协作的团队

### 自动修复器 (PR Fix)

根据发现的问题自动修改代码并提交。

**关键要素：**

- 修复策略（保守 vs 激进）
- 提交规范
- 验证要求

**推荐场景：**

- `conservative-fix.md` - 适合生产环境，只修复明确问题
- `aggressive-fix.md` - 适合开发环境，积极改进代码
- `safe-refactor-fix.md` - 适合重构场景，改进代码结构

## 🎨 自定义提示词

### 混合使用

你可以混合使用不同的提示词，也可以混合使用项目级和全局配置：

**示例 1：项目级配置（推荐给团队）**

```json
{
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/strict-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

**示例 2：混合本地和全局提示词**

```json
{
  "prompts": {
    "reviewer": "~/.config/opencode/prompts/my-custom-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/collaborative-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

**示例 3：部分自定义（其他使用默认）**

```json
{
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md"
  }
}
```

只自定义 reviewer，analyzer 和 fix 使用内置默认提示词。

### 修改示例

1. 复制示例文件
2. 根据团队需求调整
3. 保持 JSON 输出格式不变
4. 测试验证

### 创建新提示词

参考 `default-*.md` 文件，确保包含：

1. **角色定义** - AI 扮演什么角色
2. **输入说明** - 会收到什么数据
3. **规则约束** - 必须遵守的规则
4. **输出格式** - JSON schema 定义
5. **示例** - 帮助 AI 理解预期输出

## 🔧 调试技巧

### 验证 JSON 格式

确保提示词包含：

```markdown
BEGIN_JSON
{
"agent": "...",
...
}
END_JSON
```

### 测试优先级判定

在提示词中明确定义：

```markdown
Priority Guidelines:

- P0 (Blocking): 安全漏洞、数据丢失风险、构建失败
- P1 (Critical): 性能问题、内存泄漏、逻辑错误
- P2 (Important): 代码异味、可维护性问题、缺失测试
- P3 (Suggestion): 样式改进、重构建议
```

### 查看实际输出

运行命令后查看 PR 评论，检查：

- Finding 的优先级是否符合预期
- 描述是否清晰明确
- 建议是否可操作

## 📚 相关文档

- [PR Review Loop 参考文档](../pr-review-loop-reference.md)
- [配置指南](../../README.md)
- [类型定义](../../src/pr-review-loop/types.ts)

## 💡 贡献

欢迎提交你的提示词示例！优秀的提示词可以帮助整个社区。

提交要求：

1. 清晰的使用场景说明
2. 完整的 JSON schema
3. 实际测试验证
4. 中英文注释

---

**最后更新：** 2026-01-25
