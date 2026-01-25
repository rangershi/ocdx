# Doctor Command

OpenCode 环境健康检查命令，自动检测必需包和配置文件。

## 功能

- ✅ 检查 4 个必需的全局 npm 包
- ✅ 验证包版本（已安装 vs 最新版本）
- ✅ 检查 opencode.json 配置文件
- ✅ 自动修复模式（--fix 标志）
- ✅ 使用低成本模型（config.models.low）

---

## 用法

### 基本健康检查

```bash
/doctor
```

执行完整的环境检查并报告所有问题。不会自动修复任何问题。

### 自动修复模式

```bash
/doctor --fix
```

检测问题并自动修复：

- 安装缺失的包
- 更新过时的包
- 创建或修复 opencode.json 配置文件

---

## 参数

| 参数    | 类型      | 必需 | 说明                                         |
| ------- | --------- | ---- | -------------------------------------------- |
| `--fix` | `boolean` | ❌   | 自动安装/更新包并修复 opencode.json 配置文件 |

---

## 执行流程

### Step 1: 模型选择

从配置文件读取 AI 模型，优先级：

1. `config.models.low` （低成本模型）
2. `config.commentsAnalyzerModel` （回退）
3. `anthropic/claude-3-5-haiku-20241022` （默认）

**为什么使用 low 模型？**

- Doctor 命令仅验证和报告
- 不需要复杂的 AI 推理
- 成本优化

### Step 2: 检查必需包

检查 4 个全局 npm 包：

```bash
npm list -g <package> --depth=0 --json
npm view <package> version
```

对每个包：

- 检查是否已安装
- 获取已安装版本
- 获取最新可用版本
- 比较版本

### Step 3: 验证 opencode.json

检查项目根目录的 opencode.json：

- 文件是否存在
- JSON 格式是否有效
- 是否包含必需字段

### Step 4: 报告问题

生成详细报告：

- ✅ 所有检查通过
- ⚠️ 发现问题（列出所有问题）

### Step 5: 自动修复（仅在 --fix 模式）

如果使用 `--fix` 标志：

1. 安装缺失的包
2. 更新过时的包
3. 创建或修复 opencode.json
4. 重新运行检查以验证修复

---

## 输出示例

### 所有检查通过

```
✅ OpenCode Environment Health Check

**Status:** All checks passed

**Packages:**
  ✓ oh-my-opencode - installed and up to date
  ✓ opencode-openai-codex-auth - installed and up to date
  ✓ opencode-antigravity-auth - installed and up to date
  ✓ agent-browser - installed and up to date

**Configuration:**
  ✓ opencode.json - valid

**AI Model:** anthropic/claude-3-5-haiku-20241022
```

### 发现问题

```
⚠️ OpenCode Environment Health Check

**AI Model:** anthropic/claude-3-5-haiku-20241022

**Issues Found:**

**Packages:**
  ✗ oh-my-opencode - not installed
  ⚠ agent-browser - 0.5.0 → 0.6.0 (update available)

**Configuration:**
  ✓ opencode.json - valid

Run `/doctor --fix` to auto-fix these issues.
```

### 自动修复示例

```
⚠️ OpenCode Environment Health Check

**AI Model:** anthropic/claude-3-5-haiku-20241022

**Issues Found:**

**Packages:**
  ✗ oh-my-opencode - not installed
  ⚠ agent-browser - 0.5.0 → 0.6.0 (update available)

**Configuration:**
  ✗ opencode.json - not found at /Users/username/project/opencode.json

**Auto-fixing issues...**

Installing oh-my-opencode@latest...
  ✓ oh-my-opencode installed successfully
Updating agent-browser from 0.5.0 to 0.6.0...
  ✓ agent-browser updated successfully
  ✓ Created opencode.json at /Users/username/project/opencode.json

**Re-running health check...**

✅ OpenCode Environment Health Check

**Status:** All checks passed

**Packages:**
  ✓ oh-my-opencode - installed and up to date
  ✓ opencode-openai-codex-auth - installed and up to date
  ✓ opencode-antigravity-auth - installed and up to date
  ✓ agent-browser - installed and up to date

**Configuration:**
  ✓ opencode.json - valid

**AI Model:** anthropic/claude-3-5-haiku-20241022
```

---

## 检查的包

Doctor 命令检查以下 4 个全局 npm 包：

### 1. oh-my-opencode

**用途：** OpenCode 核心框架  
**必需：** ✅ 是  
**安装：** `npm install -g oh-my-opencode`

### 2. opencode-openai-codex-auth

**用途：** OpenAI 认证支持  
**必需：** ✅ 是  
**安装：** `npm install -g opencode-openai-codex-auth`

### 3. opencode-antigravity-auth

**用途：** Antigravity 认证支持  
**必需：** ✅ 是  
**安装：** `npm install -g opencode-antigravity-auth`

### 4. agent-browser

**用途：** 浏览器自动化代理  
**必需：** ✅ 是  
**安装：** `npm install -g agent-browser`

---

## 配置验证

Doctor 检查项目根目录的 `opencode.json` 文件：

### 必需字段

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["AGENTS.md", "ruler/**/*.md"]
}
```

### 验证规则

1. **文件存在：** 必须在项目根目录存在 `opencode.json`
2. **有效 JSON：** 文件必须是有效的 JSON 格式
3. **Schema 字段：** 必须包含 `$schema: "https://opencode.ai/config.json"`
4. **Instructions 数组：** 必须包含 `instructions` 数组
5. **必需条目：** `instructions` 必须包含：
   - `"AGENTS.md"` - 项目代理配置
   - `"ruler/**/*.md"` - 规则文件 glob 模式

### 自动创建的配置文件

如果使用 `--fix` 且配置文件缺失或无效，将创建以下默认配置：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["AGENTS.md", "ruler/**/*.md"]
}
```

---

## AI 模型选择

Doctor 命令使用低成本 AI 模型执行环境检查。

### 模型选择优先级

1. **配置文件 `models.low`**（优先）

   ```json
   {
     "models": {
       "low": "anthropic/claude-3-5-haiku-20241022"
     }
   }
   ```

2. **配置文件 `commentsAnalyzerModel`**（回退）

   ```json
   {
     "commentsAnalyzerModel": "anthropic/claude-3-7-sonnet-20250219"
   }
   ```

3. **默认模型**（最终回退）
   ```
   anthropic/claude-3-5-haiku-20241022
   ```

### 为什么使用低成本模型？

Doctor 命令的工作：

- ✅ 检查包是否安装
- ✅ 比较版本号
- ✅ 验证 JSON 结构
- ✅ 生成报告

这些操作**不需要**：

- ❌ 复杂的代码推理
- ❌ 创意内容生成
- ❌ 深度分析

因此使用 `models.low` 可以：

- 💰 降低成本
- ⚡ 加快响应速度
- ✅ 保持相同的验证质量

---

## 常见问题

### Q: npm install 失败，提示权限错误

**A:** 使用 sudo 或配置 npm 全局目录：

```bash
# 方案 1: 使用 sudo（不推荐）
sudo /doctor --fix

# 方案 2: 配置 npm prefix（推荐）
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 然后重新运行
/doctor --fix
```

### Q: 包显示过时，但我刚刚更新过

**A:** npm 注册表缓存可能过期。清除缓存：

```bash
npm cache clean --force
/doctor
```

### Q: opencode.json 存在但 doctor 说它无效

**A:** 检查 JSON 语法和必需字段：

```bash
# 验证 JSON 语法
cat opencode.json | jq .

# 检查必需字段
cat opencode.json | jq '."$schema", .instructions'
```

确保包含：

- `$schema` 字段指向 `https://opencode.ai/config.json`
- `instructions` 数组包含 `"AGENTS.md"` 和 `"ruler/**/*.md"`

### Q: 自动修复创建了 opencode.json，但我已经有一个

**A:** 仅当现有文件是无效 JSON 时才会发生这种情况。Doctor 会创建备份：

```bash
# 备份文件位置
ls -la opencode.json.backup

# 恢复备份（如果需要）
mv opencode.json.backup opencode.json
```

### Q: 如何查看 doctor 使用的模型？

**A:** 检查输出底部的 "AI Model" 行：

```
**AI Model:** anthropic/claude-3-5-haiku-20241022
```

或查看配置文件：

```bash
# 项目配置
cat .opencode/ocdx.json | jq '.models.low'

# 全局配置
cat ~/.config/opencode/ocdx.json | jq '.models.low'
```

### Q: 可以跳过某些包的检查吗？

**A:** 不可以。这 4 个包都是 OpenCode 环境运行所必需的。如果不需要某个功能（如 OpenAI 或 Antigravity），可以安装包但不使用。

### Q: doctor 命令需要多长时间？

**A:** 通常情况：

- 基本检查（`/doctor`）：5-10 秒
- 自动修复（`/doctor --fix`）：30-60 秒（取决于网络速度）

如果超过 2 分钟，可能是网络问题或 npm 注册表响应慢。

---

## 相关文档

- [Configuration Guide](./CONFIGURATION.md) - 完整配置参考
- [Git Commit and PR](./GIT_COMMIT_AND_PR.md) - Git 工作流（使用 models.low）
- [Quick Start](./QUICK_START.md) - 快速入门指南

---

## 实现细节

Doctor 命令实现位于 `src/index.ts` (lines 805-1008)。

### 技术栈

- **包管理：** npm CLI (`npm list -g`, `npm view`, `npm install -g`)
- **Shell 执行：** Bun's `$` shell API
- **配置加载：** `loadOcdxConfigStrict(directory)`
- **模型选择：** `config.models?.low || config.commentsAnalyzerModel || fallback`

### 包检查逻辑

```typescript
// 检查包是否已安装
const listOutput = await $`npm list -g ${pkg} --depth=0 --json`.text();
const listData = JSON.parse(listOutput);
const installed = !!listData.dependencies?.[pkg];
const installedVersion = listData.dependencies?.[pkg]?.version;

// 获取最新版本
const viewOutput = await $`npm view ${pkg} version`.text();
const latestVersion = viewOutput.trim();

// 比较版本
const upToDate = installedVersion === latestVersion;
```

### opencode.json 验证逻辑

```typescript
// 检查文件存在
const configPath = path.join(directory, 'opencode.json');
const configExists = await fs.exists(configPath);

// 验证 JSON 格式和内容
const configContent = await fs.readFile(configPath, 'utf-8');
const config = JSON.parse(configContent);

// 验证必需字段
const hasSchema = config.$schema === 'https://opencode.ai/config.json';
const hasInstructions = Array.isArray(config.instructions);
const hasAgentsMd = config.instructions.includes('AGENTS.md');
const hasRulerGlob = config.instructions.includes('ruler/**/*.md');
```

---

**最后更新：** 2026-01-25
