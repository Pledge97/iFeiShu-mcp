---
title: npx 双模式支持设计
date: 2026-04-15
status: approved
---

# npx 双模式支持设计

## 目标

将 xfchat-mcp 发布到公开 npm registry，支持通过 `npx xfchat-mcp` 启动，同时兼容两种 MCP 通信模式：

- **HTTP 模式**（默认）：启动持久 HTTP 服务，适合团队共享部署
- **stdio 模式**（`--stdio` 参数）：通过标准输入输出通信，适合个人本地使用

## 用户配置

### HTTP 模式

```bash
npx xfchat-mcp   # 启动 HTTP 服务，监听 PORT（默认 5201）
```

Claude Code 配置：
```json
{
  "type": "http",
  "url": "http://your-server:5201/mcp"
}
```

### stdio 模式

Claude Code 配置：
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "xfchat-mcp", "--stdio"],
  "env": {
    "FEISHU_APP_ID": "cli_xxx",
    "FEISHU_APP_SECRET": "xxx",
    "FEISHU_BASE_URL": "https://open.xfchat.iflytek.com",
    "OAUTH_REDIRECT_URI": "http://localhost:5201/oauth/callback"
  }
}
```

## 架构

### 文件变更

```
src/
  index.ts        ← 修改：解析 --stdio 参数，分叉到两种模式
  stdio.ts        ← 新增：stdio 模式入口
  config.ts       ← 修改：新增 mode 字段，stdio 模式默认 DB 路径
  mcp/
    tools/
      auth.ts     ← 修改：auth_login 在 stdio 模式下启动临时 HTTP server

package.json      ← 修改：去掉 private，添加 bin/files 字段
```

### 入口分叉（src/index.ts）

```typescript
const isStdio = process.argv.includes('--stdio');
if (isStdio) {
  // 启动 stdio 模式
} else {
  // 启动 HTTP 模式（现有逻辑）
}
```

### stdio 模式入口（src/stdio.ts）

1. 从 `~/.xfchat-mcp/tokens.db` 加载 DB（跨进程重启持久化）
2. 创建单一 `SessionContext`（stdio 无多会话概念）
3. 创建 MCP server（复用 `createMcpServer`）
4. 连接 `StdioServerTransport`

### OAuth 回调（stdio 模式下的 auth_login）

stdio 进程无持久 HTTP server，登录时需临时起一个：

1. 从 `OAUTH_REDIRECT_URI` 解析端口（如 `http://localhost:5201/...` → 5201）
2. 在该端口启动临时 Express server，只注册 `/oauth/callback` 路由
3. 返回 OAuth URL 给用户
4. 用户浏览器完成授权，飞书回调到临时 server
5. 临时 server 交换 code、存储 token、关闭

`state` 参数在 stdio 模式下用随机 UUID（CSRF 防护），无需关联 MCP session。

### config.ts 变更

```typescript
export const config = {
  // ...现有字段不变...
  server: {
    mode: process.argv.includes('--stdio') ? 'stdio' : 'http',
    port: parseInt(process.env.PORT ?? '5201', 10),
    dbPath: process.argv.includes('--stdio')
      ? path.join(os.homedir(), '.xfchat-mcp', 'tokens.db')
      : './data/tokens.db',
  },
};
```

### auth.ts 变更

`registerAuthTools` 接收 `mode` 参数（或从 config 读取），在 stdio 模式下：

- `auth_login`：启动临时 HTTP server，等待回调完成后关闭
- `auth_status`：逻辑不变

### package.json 变更

```json
{
  "name": "xfchat-mcp",
  "private": false,
  "bin": {
    "xfchat-mcp": "dist/index.js"
  },
  "files": ["dist/", "README.md"]
}
```

`dist/index.js` 需要 shebang：`#!/usr/bin/env node`

## token 存储路径

| 模式 | 路径 |
|------|------|
| HTTP | `./data/tokens.db` |
| stdio | `~/.xfchat-mcp/tokens.db` |

## 发布流程

1. `npm run build`
2. `npm version patch/minor/major`
3. `npm publish --access public`

## 不变的部分

- 所有 MCP 工具逻辑（document、wiki、chat）完全复用
- DB 结构和 token 刷新逻辑不变
- HTTP 模式行为与现在完全一致
