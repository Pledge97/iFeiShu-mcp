# npx 双模式支持实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持通过 `npx xfchat-mcp` 启动，兼容 HTTP 和 stdio 两种 MCP 通信模式

**Architecture:** 统一入口 `src/index.ts` 检测 `--stdio` 参数分叉，HTTP 模式保持现有逻辑，stdio 模式新增 `src/stdio.ts` 入口，复用所有 MCP 工具逻辑。stdio 模式下 OAuth 登录时临时启动 HTTP server 接收回调。

**Tech Stack:** TypeScript, Express, @modelcontextprotocol/sdk, sql.js

---

## 文件结构

**新增文件：**
- `src/stdio.ts` - stdio 模式入口，创建 StdioServerTransport
- `src/mcp/oauthServer.ts` - 临时 OAuth 回调 server（stdio 模式专用）

**修改文件：**
- `src/index.ts` - 添加 shebang，解析 `--stdio` 参数分叉
- `src/config.ts` - 新增 `mode` 字段，stdio 模式使用 `~/.xfchat-mcp/tokens.db`
- `src/mcp/tools/auth.ts` - `auth_login` 在 stdio 模式下启动临时 server
- `src/mcp/index.ts` - `createMcpServer` 传递 mode 参数
- `package.json` - 去掉 `private`，添加 `bin` 和 `files` 字段

---

### Task 1: 更新 config.ts 支持双模式

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: 添加 mode 字段和 stdio DB 路径逻辑**

```typescript
import { homedir } from 'os';
import { join } from 'path';

/** 全局配置，从环境变量读取，启动时一次性解析。 */
export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? '',
    appSecret: process.env.FEISHU_APP_SECRET ?? '',
    baseUrl: process.env.FEISHU_BASE_URL ?? 'https://open.feishu.cn',
  },
  oauth: {
    redirectUri: process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:5201/oauth/callback',
  },
  server: {
    mode: process.argv.includes('--stdio') ? ('stdio' as const) : ('http' as const),
    port: parseInt(process.env.PORT ?? '5201', 10),
    dbPath: process.argv.includes('--stdio')
      ? join(homedir(), '.xfchat-mcp', 'tokens.db')
      : './data/tokens.db',
  },
};
```

- [ ] **Step 2: 验证类型正确**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add mode field to config for stdio/http detection"
```

---

### Task 2: 创建临时 OAuth server（stdio 模式专用）

**Files:**
- Create: `src/mcp/oauthServer.ts`

- [ ] **Step 1: 编写临时 OAuth server 逻辑**

```typescript
import express from 'express';
import axios from 'axios';
import { Server } from 'http';
import type { Db } from '../db/index.js';
import { config } from '../config.js';
import { getAppAccessToken } from '../feishu/appAuth.js';

/**
 * stdio 模式下临时启动的 OAuth 回调 server。
 * 接收飞书回调，交换 code 获取 token，存储后关闭。
 */
export function createTemporaryOAuthServer(
  db: Db,
  state: string,
  onSuccess: (openId: string, userName: string) => void,
  onError: (error: string) => void
): { server: Server; port: number } {
  const app = express();

  app.get('/oauth/callback', async (req, res) => {
    const { code, state: receivedState } = req.query as { code: string; state: string };

    if (!code || !receivedState) {
      res.status(400).send('<h1>参数缺失</h1>');
      onError('OAuth callback missing code or state');
      return;
    }

    if (receivedState !== state) {
      res.status(400).send('<h1>state 参数不匹配</h1>');
      onError('OAuth state mismatch');
      return;
    }

    try {
      const appToken = await getAppAccessToken();

      const tokenRes = await axios.post(
        `${config.feishu.baseUrl}/open-apis/authen/v1/oidc/access_token`,
        { grant_type: 'authorization_code', code },
        { headers: { Authorization: `Bearer ${appToken}` } }
      );
      const tokenData = tokenRes.data.data as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const userRes = await axios.get(
        `${config.feishu.baseUrl}/open-apis/authen/v1/user_info`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const userInfo = userRes.data.data as { open_id: string; name: string };

      const now = Math.floor(Date.now() / 1000);
      db.upsertSession({
        open_id: userInfo.open_id,
        user_name: userInfo.name,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: now + tokenData.expires_in,
        updated_at: now,
      });

      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h1>✅ 登录成功</h1>
          <p>欢迎，<strong>${userInfo.name}</strong>！</p>
          <p>您现在可以关闭此窗口，回到 Claude Code 继续使用飞书工具。</p>
        </body></html>
      `);

      onSuccess(userInfo.open_id, userInfo.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<h1>登录失败</h1><pre>${message}</pre>`);
      onError(message);
    }
  });

  // 从 OAUTH_REDIRECT_URI 解析端口
  const url = new URL(config.oauth.redirectUri);
  const port = parseInt(url.port || '80', 10);

  const server = app.listen(port);
  return { server, port };
}
```

- [ ] **Step 2: 验证类型正确**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mcp/oauthServer.ts
git commit -m "feat: add temporary OAuth server for stdio mode"
```

---

### Task 3: 更新 auth.ts 支持 stdio 模式登录

**Files:**
- Modify: `src/mcp/tools/auth.ts`

- [ ] **Step 1: 修改 registerAuthTools 接收 mode 参数**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { randomUUID } from 'crypto';
import type { Db } from '../../db/index.js'
import type { SessionContext } from '../../feishu/types.js'
import { config } from '../../config.js'
import { logToolCall } from '../logger.js'
import { createTemporaryOAuthServer } from '../oauthServer.js';

export function registerAuthTools(server: McpServer, ctx: SessionContext, db: Db) {
  server.tool('auth_login', '生成飞书 OAuth 授权 URL，在浏览器中打开完成登录', {}, async () => {
    logToolCall('auth_login', { mcpSessionId: ctx.mcpSessionId })

    if (config.server.mode === 'stdio') {
      // stdio 模式：启动临时 HTTP server
      const state = randomUUID();
      const params = new URLSearchParams({
        client_id: config.feishu.appId,
        redirect_uri: config.oauth.redirectUri,
        state,
        scope: 'wiki:wiki docx:document drive:drive:readonly im:message im:message:send_as_bot contact:user.employee_id:readonly',
      });
      const url = `${config.feishu.baseUrl}/open-apis/authen/v1/authorize?${params}`;

      return new Promise((resolve) => {
        const { server: httpServer, port } = createTemporaryOAuthServer(
          db,
          state,
          (openId, userName) => {
            ctx.openId = openId;
            httpServer.close();
            resolve({
              content: [{
                type: 'text' as const,
                text: `登录成功！欢迎，${userName}。现在可以使用所有飞书工具。`
              }]
            });
          },
          (error) => {
            httpServer.close();
            resolve({
              content: [{
                type: 'text' as const,
                text: `登录失败：${error}`
              }]
            });
          }
        );

        // 立即返回 URL，server 在后台等待回调
        setTimeout(() => {
          resolve({
            content: [{
              type: 'text' as const,
              text: `请在浏览器中打开以下 URL 完成飞书登录（临时 server 已在端口 ${port} 启动）：\n\n${url}\n\n授权完成后此工具会自动返回结果。`
            }]
          });
        }, 100);
      });
    } else {
      // HTTP 模式：现有逻辑
      const params = new URLSearchParams({
        client_id: config.feishu.appId,
        redirect_uri: config.oauth.redirectUri,
        state: ctx.mcpSessionId,
        scope: 'wiki:wiki docx:document drive:drive:readonly im:message im:message:send_as_bot contact:user.employee_id:readonly',
      });
      const url = `${config.feishu.baseUrl}/open-apis/authen/v1/authorize?${params}`;
      return {
        content: [{ type: 'text' as const, text: `请在浏览器中打开以下 URL 完成飞书登录：\n\n${url}` }]
      }
    }
  })

  server.tool('auth_status', '查询当前会话的登录状态及用户信息', {}, async () => {
    logToolCall('auth_status', { openId: ctx.openId })
    if (!ctx.openId) {
      return {
        content: [{ type: 'text' as const, text: '未登录。请先调用 auth_login 完成授权。' }]
      }
    }
    const session = db.getSession(ctx.openId)
    if (!session) {
      return {
        content: [{ type: 'text' as const, text: '未登录。请先调用 auth_login 完成授权。' }]
      }
    }
    const expiresIn = session.expires_at - Math.floor(Date.now() / 1000)
    return {
      content: [
        {
          type: 'text' as const,
          text: `已登录\n用户：${session.user_name}\nopen_id：${session.open_id}\ntoken 剩余有效期：${Math.max(0, expiresIn)} 秒`
        }
      ]
    }
  })
}
```

- [ ] **Step 2: 验证类型正确**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/auth.ts
git commit -m "feat: support stdio mode OAuth with temporary server"
```

---

### Task 4: 创建 stdio 模式入口

**Files:**
- Create: `src/stdio.ts`

- [ ] **Step 1: 编写 stdio 入口逻辑**

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDb } from './db/index.js';
import { createMcpServer } from './mcp/index.js';
import { config } from './config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { SessionContext } from './feishu/types.js';

/**
 * stdio 模式入口：通过标准输入输出与 MCP 客户端通信。
 * 单一进程，单一 session，DB 存储在用户 home 目录。
 */
export async function startStdioMode() {
  const dbDir = dirname(config.server.dbPath);
  mkdirSync(dbDir, { recursive: true });

  const db = await createDb(config.server.dbPath);

  // stdio 模式下只有一个 session
  const ctx: SessionContext = {
    mcpSessionId: 'stdio-session',
    openId: null,
  };

  const server = createMcpServer(ctx, db);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // stdio 模式下进程由 MCP 客户端管理，无需额外日志
}
```

- [ ] **Step 2: 验证类型正确**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/stdio.ts
git commit -m "feat: add stdio mode entry point"
```

---

### Task 5: 更新 index.ts 支持模式分叉

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 添加 shebang 和模式分叉逻辑**

```typescript
#!/usr/bin/env node
import 'dotenv/config';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createDb } from './db/index.js';
import { createApp } from './server.js';
import { config } from './config.js';
import { startStdioMode } from './stdio.js';

if (config.server.mode === 'stdio') {
  startStdioMode().catch((err) => {
    console.error('stdio mode failed:', err);
    process.exit(1);
  });
} else {
  const dbDir = dirname(config.server.dbPath);
  mkdirSync(dbDir, { recursive: true });

  const db = await createDb(config.server.dbPath);
  const app = createApp(db);

  app.listen(config.server.port, () => {
    console.log(`Feishu MCP server running on port ${config.server.port}`);
    console.log(`MCP endpoint: http://localhost:${config.server.port}/mcp`);
  });
}
```

- [ ] **Step 2: 验证类型正确**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add shebang and mode detection to index.ts"
```

---

### Task 6: 更新 package.json 支持 npx

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 修改 package.json**

```json
{
  "name": "xfchat-mcp",
  "version": "1.0.0",
  "private": false,
  "type": "module",
  "bin": {
    "xfchat-mcp": "dist/index.js"
  },
  "files": [
    "dist/",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "axios": "^1.7.7",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "sql.js": "^1.14.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.7.5",
    "@types/sql.js": "^1.4.11",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: 验证 package.json 格式**

Run: `npm run build`
Expected: Build succeeds, `dist/index.js` created with shebang

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: configure package for npx with bin and files"
```

---

### Task 7: 更新 README 文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在快速开始前添加 npx 使用说明**

在 `## 快速开始` 之前插入：

```markdown
## 使用方式

### 方式一：npx 启动（推荐）

#### HTTP 模式（团队共享）

```bash
npx xfchat-mcp
```

在 `~/.claude.json` 中配置：
```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "http://your-server:5201/mcp"
    }
  }
}
```

#### stdio 模式（个人本地）

在 `~/.claude.json` 中配置：
```json
{
  "mcpServers": {
    "feishu": {
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
  }
}
```

### 方式二：本地开发

适合需要修改源码或调试的场景。
```

- [ ] **Step 2: 更新原有的"快速开始"标题**

将 `## 快速开始` 改为 `## 本地开发快速开始`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add npx usage instructions"
```

---

### Task 8: 构建和本地测试

**Files:**
- Test: `dist/index.js`

- [ ] **Step 1: 构建项目**

Run: `npm run build`
Expected: Build succeeds, `dist/` directory created

- [ ] **Step 2: 测试 HTTP 模式启动**

Run: `node dist/index.js`
Expected: 输出 "Feishu MCP server running on port 5201"

按 Ctrl+C 停止

- [ ] **Step 3: 测试 stdio 模式启动（手动验证）**

Run: `node dist/index.js --stdio`
Expected: 进程启动，无输出（等待 stdio 输入）

按 Ctrl+C 停止

- [ ] **Step 4: 验证 shebang 可执行**

Run: `chmod +x dist/index.js && ./dist/index.js --help 2>&1 | head -5`
Expected: 进程启动（即使没有 --help 支持，说明 shebang 生效）

- [ ] **Step 5: 运行现有测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: verify build and dual-mode startup"
```

---

### Task 9: 最终验证和文档完善

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 添加 token 存储路径说明**

在 README 的"技术架构"部分添加：

```markdown
- **token 存储：**
  - HTTP 模式：`./data/tokens.db`（相对于启动目录）
  - stdio 模式：`~/.xfchat-mcp/tokens.db`（用户 home 目录）
```

- [ ] **Step 2: 添加发布说明**

在 README 末尾添加：

```markdown
## 发布到 npm

```bash
npm run build
npm version patch  # 或 minor/major
npm publish --access public
```

发布后用户可直接 `npx xfchat-mcp` 使用。
```

- [ ] **Step 3: 验证所有文档链接和代码示例**

手动检查 README 中的配置示例是否与实际代码一致

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add token storage and npm publish instructions"
```

---

## 验收标准

- [ ] `npx xfchat-mcp` 启动 HTTP 服务（默认端口 5201）
- [ ] `npx xfchat-mcp --stdio` 启动 stdio 模式（无输出，等待 MCP 客户端）
- [ ] stdio 模式下 `auth_login` 临时启动 HTTP server，回调成功后关闭
- [ ] HTTP 模式行为与修改前完全一致
- [ ] 所有现有测试通过
- [ ] `npm run build` 成功，`dist/index.js` 包含 shebang
- [ ] README 包含两种模式的完整配置示例
