# OCDX Configuration Guide

## 配置文件位置

OCDX 支持**项目级**和**全局级**两种配置方式。

### 配置文件查找顺序（优先级从高到低）

1. **项目级（OpenCode 标准）**: `<项目根目录>/.opencode/ocdx.json` ← **推荐**
2. **项目级（根目录）**: `<项目根目录>/ocdx.json`
3. **全局级（Fallback）**: `~/.config/opencode/ocdx.json`

系统会按顺序查找这些位置，使用**第一个找到的配置文件**。

---

## 配置方式对比

### 方式 A：项目级配置（推荐）

**优点：**

- ✅ 配置随项目版本控制
- ✅ 团队成员共享相同配置
- ✅ 不同项目可使用不同的审查策略
- ✅ 便于 CI/CD 集成

**适用场景：**

- 团队协作项目
- 开源项目（标准化审查流程）
- 不同项目有不同审查需求

**创建方式：**

```bash
# 在项目根目录执行
mkdir -p .opencode
cat > .opencode/ocdx.json <<'EOF'
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
EOF
```

**提交到版本控制：**

```bash
git add .opencode/ocdx.json
git commit -m "chore: add OCDX PR review configuration"
```

---

### 方式 B：全局配置

**优点：**

- ✅ 一次配置，所有项目通用
- ✅ 个人偏好设置
- ✅ 不影响项目仓库

**适用场景：**

- 个人项目
- 所有项目使用相同审查标准
- 不希望提交配置到版本控制

**创建方式：**

```bash
# 创建全局配置目录和提示词目录
mkdir -p ~/.config/opencode/prompts

# 复制自定义提示词
cp docs/prompt-examples/reviewer/typescript-reviewer.md \
   ~/.config/opencode/prompts/my-reviewer.md

# 创建全局配置文件
cat > ~/.config/opencode/ocdx.json <<'EOF'
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

---

## 配置文件结构

### 完整示例

```json
{
  "reviewerModels": [
    "anthropic/claude-3-7-sonnet-20250219",
    "anthropic/claude-3-5-sonnet-20241022"
  ],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/strict-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

### 字段说明

| 字段                       | 类型       | 必需 | 说明                                         |
| -------------------------- | ---------- | ---- | -------------------------------------------- |
| `reviewerModels`           | `string[]` | ✅   | 审查员模型数组（1-5 个），支持多模型并行审查 |
| `commentsAnalyzerModel`    | `string`   | ✅   | 评论分析器使用的模型                         |
| `prFixModel`               | `string`   | ✅   | 自动修复器使用的模型                         |
| `models`                   | `object`   | ❌   | 可选，定义高中低三档模型                     |
| `models.high`              | `string`   | ❌   | 高档模型（质量优先）                         |
| `models.medium`            | `string`   | ❌   | 中档模型（均衡）                             |
| `models.low`               | `string`   | ❌   | 低档模型（成本/速度优先）                    |
| `prompts`                  | `object`   | ❌   | 可选，自定义提示词路径                       |
| `prompts.reviewer`         | `string`   | ❌   | 审查员提示词文件路径                         |
| `prompts.commentsAnalyzer` | `string`   | ❌   | 评论分析器提示词文件路径                     |
| `prompts.prFix`            | `string`   | ❌   | 修复器提示词文件路径                         |

### 这些字段会被哪些命令使用？

- `/pr-review-loop`:
  - `reviewerModels`: 多模型并行审查
  - `commentsAnalyzerModel`: 汇总/分析 PR 评论
  - `prFixModel`: 生成修复补丁
- `/git-commit-and-pr`:
  - 默认会使用 `models.low` 作为 AI 模型（当你不传 `--model` 且配置了 `models.low` 时）
  - 否则回退到 `commentsAnalyzerModel`
  - 如果传了 `--model`，则以 `--model` 为准（覆盖配置）

### 模型字符串格式

```
<provider>/<model-name>
```

**支持的 Provider:**

- `anthropic` - Anthropic Claude 系列
- `openai` - OpenAI GPT 系列
- 其他 OpenCode 支持的 provider

**示例：**

- `anthropic/claude-3-7-sonnet-20250219`
- `anthropic/claude-3-5-sonnet-20241022`
- `openai/gpt-4-turbo`

---

## 提示词路径配置

### 支持的路径格式

| 格式          | 示例                                                         | 说明                     | 适用场景               |
| ------------- | ------------------------------------------------------------ | ------------------------ | ---------------------- |
| **相对路径**  | `docs/prompt-examples/reviewer/security-focused-reviewer.md` | 相对于项目根目录         | 项目级配置（团队共享） |
| **绝对路径**  | `/Users/you/custom-prompts/my-reviewer.md`                   | 完整文件系统路径         | 个人自定义路径         |
| **Home 路径** | `~/.config/opencode/prompts/my-reviewer.md`                  | `~` 自动展开为用户主目录 | 全局配置（跨机器）     |

### 路径解析规则

1. **相对路径**（不以 `/` 或 `~` 开头）
   - 解析为相对于**项目根目录**的路径
   - 示例：`docs/prompts/my.md` → `<项目根>/docs/prompts/my.md`

2. **绝对路径**（以 `/` 开头）
   - 直接使用绝对路径
   - 示例：`/etc/ocdx/prompts/my.md`

3. **Home 路径**（以 `~` 开头）
   - `~` 展开为当前用户主目录
   - 示例：`~/prompts/my.md` → `/Users/you/prompts/my.md`

### 最佳实践

#### 项目级配置

```json
{
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/strict-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

✅ 使用相对路径  
✅ 提交到版本控制  
✅ 团队成员自动使用相同配置

#### 全局配置

```json
{
  "prompts": {
    "reviewer": "~/.config/opencode/prompts/my-reviewer.md",
    "commentsAnalyzer": "~/.config/opencode/prompts/my-analyzer.md",
    "prFix": "~/.config/opencode/prompts/my-fix.md"
  }
}
```

✅ 使用 Home 路径  
✅ 个人偏好设置  
✅ 不影响项目仓库

---

## 多模型审查配置

### 使用多个审查员模型

```json
{
  "reviewerModels": [
    "anthropic/claude-3-7-sonnet-20250219",
    "anthropic/claude-3-5-sonnet-20241022",
    "openai/gpt-4-turbo"
  ]
}
```

**工作原理：**

1. 所有审查员模型**并行运行**（同时审查）
2. 每个模型独立识别问题
3. 系统汇总所有发现的问题
4. 应用共识规则决定最终结论

**优点：**

- 更全面的问题覆盖
- 不同模型的优势互补
- 降低误判风险

**限制：**

- 最多 5 个模型（避免过度消耗资源）
- 成本随模型数量增加

---

## 配置验证

### 检查配置文件是否有效

```bash
# 运行任意 OCDX 命令，会自动验证配置
/pr-review-loop --pr 123
```

### 常见错误

#### 错误 1: 配置文件未找到

```
CONFIG_NOT_FOUND: Config file not found in any of these locations:
  - /path/to/project/.opencode/ocdx.json
  - /path/to/project/ocdx.json
  - ~/.config/opencode/ocdx.json
```

**解决：** 在上述任一位置创建配置文件

#### 错误 2: JSON 格式错误

```
CONFIG_INVALID_JSON: Config file contains invalid JSON
```

**解决：** 使用 JSON validator 检查语法（VS Code 自带）

#### 错误 3: 缺少必需字段

```
CONFIG_MISSING_FIELDS: Missing required fields: reviewerModels, commentsAnalyzerModel
```

**解决：** 补全所有必需字段

#### 错误 4: reviewerModels 数量错误

```
CONFIG_INVALID_REVIEWERS: reviewerModels must have 1-5 entries (found 0)
```

**解决：** 至少添加 1 个，最多 5 个模型

---

## 配置示例

### 示例 1: 安全重点项目（金融/医疗）

```json
{
  "reviewerModels": [
    "anthropic/claude-3-7-sonnet-20250219",
    "anthropic/claude-3-5-sonnet-20241022"
  ],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/strict-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/conservative-fix.md"
  }
}
```

### 示例 2: React/Next.js 项目

```json
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/react-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/collaborative-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/aggressive-fix.md"
  }
}
```

### 示例 3: TypeScript 严格项目

```json
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/typescript-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/default-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/default-fix.md"
  }
}
```

### 示例 4: 开源项目（快速迭代）

```json
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/default-reviewer.md",
    "commentsAnalyzer": "docs/prompt-examples/comments-analyzer/collaborative-analyzer.md",
    "prFix": "docs/prompt-examples/pr-fix/aggressive-fix.md"
  }
}
```

---

## 高级用法

### 混合项目级和全局配置

如果同时存在项目级和全局配置，**项目级优先**：

```
项目配置: .opencode/ocdx.json (使用这个) ✅
全局配置: ~/.config/opencode/ocdx.json (被忽略)
```

### 部分自定义提示词

只自定义需要的提示词，其他使用默认：

```json
{
  "reviewerModels": ["anthropic/claude-3-7-sonnet-20250219"],
  "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219",
  "prFixModel": "anthropic/claude-3-7-sonnet-20250219",
  "prompts": {
    "reviewer": "docs/prompt-examples/reviewer/security-focused-reviewer.md"
  }
}
```

未指定的 `commentsAnalyzer` 和 `prFix` 会使用内置默认提示词。

---

## 故障排查

### 问题：配置文件存在但仍然提示未找到

**原因：** 配置文件不在查找路径中

**解决：**

1. 确认当前工作目录
2. 检查配置文件路径是否正确
3. 确保文件名为 `ocdx.json`（不是 `ocdx.json.txt`）

### 问题：提示词文件找不到

**原因：** 提示词路径配置错误

**解决：**

1. 相对路径：确保相对于**项目根目录**
2. 检查文件是否存在：`ls -la <path>`
3. 检查文件权限：`chmod 644 <path>`

### 问题：模型调用失败

**原因：** 模型字符串格式错误或模型不存在

**解决：**

1. 检查模型字符串格式：`<provider>/<model-name>`
2. 确认模型在 OpenCode 中可用
3. 检查 API 配置和额度

---

## 相关文档

- [提示词示例集合](./prompt-examples/README.md)
- [PR Review Loop 参考](./pr-review-loop-reference.md)
- [类型定义](../src/pr-review-loop/types.ts)

---

**最后更新:** 2026-01-25
