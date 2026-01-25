# OpenCode Hello World Plugin

一个简单的 OpenCode 插件示例，展示了插件开发的最佳实践。

## 功能特性

- ✅ 自定义工具注册
- ✅ 事件监听和处理
- ✅ 会话状态跟踪
- ✅ 结构化日志记录
- ✅ Shell 命令执行
- ✅ 配置扩展

## 安装

### 本地开发

```bash
# 安装依赖
pnpm install

# 或使用 bun
bun install
```

### 在 OpenCode 中使用

#### 方法 1: 本地文件

将插件文件复制到：
- 项目级别: `.opencode/plugins/hello-world.ts`
- 全局级别: `~/.config/opencode/plugins/hello-world.ts`

#### 方法 2: npm 包（发布后）

在 `opencode.json` 中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-hello-world"
  ]
}
```

## 插件功能

### 自定义工具

#### 1. `hello`
向某人问候

```typescript
// 使用示例
await hello({ name: "World" });
// 返回: "👋 Hello, World! Welcome to OpenCode!"
```

#### 2. `check_directory`
检查当前目录信息

```typescript
// 使用示例
await check_directory();
// 返回目录文件列表和 git 状态
```

### 事件处理

插件监听以下 OpenCode 事件：

- `session.created` - 新会话创建时记录日志
- `session.idle` / `session.deleted` - 会话结束时统计执行时长和工具使用次数
- `message.part.updated` - 跟踪工具执行次数

### 配置扩展

插件自动添加自定义命令：

```bash
# 在 OpenCode 中使用
/hello
```

## 开发

### 构建

```bash
pnpm run build
```

### 代码检查

```bash
pnpm run lint
pnpm run format
```

### 目录结构

```
opencode-hello-world/
├── src/
│   ├── index.ts          # 插件主文件
│   └── version.ts        # 版本信息
├── dist/                 # 编译输出
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
└── README.md
```

## 最佳实践

本插件展示了以下 OpenCode 插件开发最佳实践：

### 1. 插件函数签名

```typescript
import type { Plugin } from '@opencode-ai/plugin';

export const HelloWorldPlugin: Plugin = async ({ client, directory, $ }) => {
  // 初始化代码
  return {
    tool: { /* 工具定义 */ },
    event: async ({ event }) => { /* 事件处理 */ },
    config: async (opencodeConfig) => { /* 配置修改 */ },
  };
};

export default HelloWorldPlugin;
```

### 2. 工具定义

```typescript
import { tool } from '@opencode-ai/plugin';

tool: {
  mytool: tool({
    description: '工具描述',
    args: {
      name: tool.schema.string().describe('参数描述'),
    },
    async execute(args, ctx) {
      return `结果`;
    },
  }),
}
```

### 3. 结构化日志

```typescript
await client.app.log({
  service: 'plugin-name',
  level: 'info',  // debug, info, warn, error
  message: '日志消息',
  extra: { key: 'value' },
});
```

### 4. 会话状态管理

```typescript
const sessions = new Map<string, SessionData>();

// 在 session.created 时创建
// 在 session.deleted 时清理
```

### 5. Shell 命令执行

```typescript
// 使用 Bun 的 shell API
const output = await $`ls -la ${directory}`.text();
```

## 参考资源

- [OpenCode 官方文档](https://opencode.ai/docs/plugins/)
- [插件 SDK](https://opencode.ai/docs/sdk/)
- [插件模板](https://github.com/zenobi-us/opencode-plugin-template)
- [插件生态](https://opencode.ai/docs/ecosystem/)

## 许可证

MIT

## 作者

你的名字
