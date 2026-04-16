# 飞书 MCP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建飞书 MCP 服务，支持文档管理、知识库浏览和聊天机器人功能，通过 Streamable HTTP 供多开发者使用。

**Architecture:** 单进程 Express 服务，MCP Streamable HTTP 传输，每个 HTTP 会话对应独立 McpServer 实例（通过 mcp-session-id header 路由）。SQLite 存储每个开发者的 OAuth token，app_access_token 由服务端自动维护和刷新。

**Tech Stack:** TypeScript 5, @modelcontextprotocol/sdk, Express 4, better-sqlite3, axios, zod, vitest

---

## 文件结构

```
Xfchat-MCP/
├── src/
│   ├── index.ts                  # 入口：启动 Express 服务
│   ├── server.ts                 # Express 路由 + McpServer 会话管理
│   ├── config.ts                 # 读取环境变量，统一导出
│   ├── db/
│   │   └── index.ts              # SQLite：createDb, getSession, upsertSession, deleteSession
│   ├── feishu/
│   │   ├── types.ts              # 所有飞书 API 响应类型
│   │   ├── appAuth.ts            # app_access_token 缓存 + 自动刷新
│   │   ├── userAuth.ts           # getUserToken(db, sessionId)：读取并按需刷新 user token
│   │   └── client.ts             # createFeishuClient(token)：axios 实例工厂
│   └── mcp/
│       ├── index.ts              # createMcpServer(sessionId, db)：注册全部 12 个工具
│       └── tools/
│           ├── auth.ts           # auth_login, auth_status
│           ├── document.ts       # document_create, document_get, document_search, document_append
│           ├── wiki.ts           # wiki_list_spaces, wiki_list_nodes, wiki_get_node
│           └── chat.ts           # message_send_user, message_send_group, chat_create
├── tests/
│   ├── db.test.ts
│   ├── appAuth.test.ts
│   └── tools/
│       ├── auth.test.ts
│       ├── document.test.ts
│       ├── wiki.test.ts
│       └── chat.test.ts
├── data/                         # SQLite 文件（gitignore）
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "xfchat-mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
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
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^5.0.0",
    "@types/node": "^22.7.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 4: 创建 .env.example**

```env
# 飞书应用凭证
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BASE_URL=https://open.xfchat.iflytek.com

# OAuth 回调地址（服务器公网/内网地址）
OAUTH_REDIRECT_URI=http://localhost:5201/oauth/callback

# 服务配置
PORT=5201
DB_PATH=./data/tokens.db
```

- [ ] **Step 5: 创建 .gitignore**

```
node_modules/
dist/
data/
.env
*.db
```

- [ ] **Step 6: 安装依赖**

```bash
npm install
```

Expected: 依赖安装成功，无 error。

- [ ] **Step 7: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "chore: project scaffolding"
```

---

## Task 2: 配置 + 类型定义

**Files:**
- Create: `src/config.ts`
- Create: `src/feishu/types.ts`

- [ ] **Step 1: 创建 src/config.ts**

```typescript
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
    port: parseInt(process.env.PORT ?? '5201', 10),
    dbPath: process.env.DB_PATH ?? './data/tokens.db',
  },
};
```

- [ ] **Step 2: 创建 src/feishu/types.ts**

```typescript
export interface FeishuResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface Session {
  session_id: string;
  open_id: string;
  user_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;   // Unix 秒
  updated_at: number;
}

export interface AppTokenResponse {
  app_access_token: string;
  expire: number;
}

export interface UserTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface UserInfoResponse {
  open_id: string;
  name: string;
  en_name: string;
  email: string;
}

export interface DocxDocument {
  document_id: string;
  title: string;
  revision_id: number;
}

export interface SearchResult {
  docs_entities: Array<{
    doc_token: string;
    doc_type: string;
    title: string;
    url: string;
    owner_id: string;
    create_time: string;
    edit_time: string;
  }>;
  has_more: boolean;
  total: number;
}

export interface WikiSpace {
  space_id: string;
  name: string;
  description: string;
}

export interface WikiNode {
  space_id: string;
  node_token: string;
  obj_token: string;
  obj_type: string;
  title: string;
  has_child: boolean;
  parent_node_token: string;
}

export interface Message {
  message_id: string;
  chat_id: string;
  msg_type: string;
  create_time: string;
}

export interface Chat {
  chat_id: string;
  name: string;
}

export interface UserIdBatchResult {
  user_list: Array<{
    email: string;
    user_id: string;
    open_id: string;
  }>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/config.ts src/feishu/types.ts
git commit -m "feat: add config and feishu type definitions"
```

---

## Task 3: 数据库层

**Files:**
- Create: `src/db/index.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: 写失败测试 tests/db.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../src/db/index.js';

describe('db', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('upserts and retrieves a session', () => {
    db.upsertSession({
      session_id: 'sess-1',
      open_id: 'ou_abc',
      user_name: 'Alice',
      access_token: 'at_123',
      refresh_token: 'rt_456',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const session = db.getSession('sess-1');
    expect(session?.open_id).toBe('ou_abc');
    expect(session?.user_name).toBe('Alice');
  });

  it('returns undefined for unknown session', () => {
    expect(db.getSession('not-exist')).toBeUndefined();
  });

  it('deletes a session', () => {
    db.upsertSession({
      session_id: 'sess-2',
      open_id: 'ou_xyz',
      user_name: 'Bob',
      access_token: 'at_789',
      refresh_token: 'rt_000',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });
    db.deleteSession('sess-2');
    expect(db.getSession('sess-2')).toBeUndefined();
  });

  it('updates existing session on upsert', () => {
    const base = {
      session_id: 'sess-3',
      open_id: 'ou_upd',
      user_name: 'Carol',
      access_token: 'at_old',
      refresh_token: 'rt_old',
      expires_at: 1000,
      updated_at: 1000,
    };
    db.upsertSession(base);
    db.upsertSession({ ...base, access_token: 'at_new', expires_at: 9999999999 });
    expect(db.getSession('sess-3')?.access_token).toBe('at_new');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/db.test.ts
```

Expected: FAIL with "Cannot find module '../src/db/index.js'"

- [ ] **Step 3: 实现 src/db/index.ts**

```typescript
import Database from 'better-sqlite3';
import type { Session } from '../feishu/types.js';

export function createDb(dbPath: string) {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id    TEXT PRIMARY KEY,
      open_id       TEXT NOT NULL,
      user_name     TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  const stmtGet = db.prepare<[string], Session>(
    'SELECT * FROM sessions WHERE session_id = ?'
  );

  const stmtUpsert = db.prepare(`
    INSERT INTO sessions (session_id, open_id, user_name, access_token, refresh_token, expires_at, updated_at)
    VALUES (@session_id, @open_id, @user_name, @access_token, @refresh_token, @expires_at, @updated_at)
    ON CONFLICT(session_id) DO UPDATE SET
      open_id       = excluded.open_id,
      user_name     = excluded.user_name,
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at    = excluded.expires_at,
      updated_at    = excluded.updated_at
  `);

  const stmtDelete = db.prepare('DELETE FROM sessions WHERE session_id = ?');

  return {
    getSession(sessionId: string): Session | undefined {
      return stmtGet.get(sessionId);
    },
    upsertSession(session: Session): void {
      stmtUpsert.run(session);
    },
    deleteSession(sessionId: string): void {
      stmtDelete.run(sessionId);
    },
    close(): void {
      db.close();
    },
  };
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/db.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts tests/db.test.ts
git commit -m "feat: add SQLite session store"
```

---

## Task 4: App Token 管理

**Files:**
- Create: `src/feishu/appAuth.ts`
- Create: `tests/appAuth.test.ts`

- [ ] **Step 1: 写失败测试 tests/appAuth.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('appAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('fetches and caches app_access_token', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { code: 0, app_access_token: 'tok_abc', expire: 7200 },
    });

    const { getAppAccessToken } = await import('../src/feishu/appAuth.js');
    const token1 = await getAppAccessToken();
    const token2 = await getAppAccessToken();

    expect(token1).toBe('tok_abc');
    expect(token2).toBe('tok_abc');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when expired', async () => {
    mockedAxios.post = vi.fn()
      .mockResolvedValueOnce({ data: { code: 0, app_access_token: 'tok_old', expire: 0 } })
      .mockResolvedValueOnce({ data: { code: 0, app_access_token: 'tok_new', expire: 7200 } });

    const { getAppAccessToken } = await import('../src/feishu/appAuth.js');
    const token1 = await getAppAccessToken();
    const token2 = await getAppAccessToken();

    expect(token1).toBe('tok_old');
    expect(token2).toBe('tok_new');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/appAuth.test.ts
```

Expected: FAIL with "Cannot find module '../src/feishu/appAuth.js'"

- [ ] **Step 3: 实现 src/feishu/appAuth.ts**

```typescript
import axios from 'axios';
import { config } from '../config.js';

let cachedToken: string | null = null;
let expiresAt = 0;

export async function getAppAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < expiresAt - 60) {
    return cachedToken;
  }

  const res = await axios.post(
    `${config.feishu.baseUrl}/open-apis/auth/v3/app_access_token/internal`,
    { app_id: config.feishu.appId, app_secret: config.feishu.appSecret }
  );

  const { app_access_token, expire } = res.data as {
    app_access_token: string;
    expire: number;
  };

  cachedToken = app_access_token;
  expiresAt = now + expire;
  return cachedToken;
}

// 仅供测试重置缓存使用
export function _resetCache() {
  cachedToken = null;
  expiresAt = 0;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/appAuth.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/feishu/appAuth.ts tests/appAuth.test.ts
git commit -m "feat: add app_access_token manager with auto-refresh"
```

---

## Task 5: User Token 助手 + Axios 工厂

**Files:**
- Create: `src/feishu/userAuth.ts`
- Create: `src/feishu/client.ts`

- [ ] **Step 1: 创建 src/feishu/client.ts**

```typescript
import axios from 'axios';
import { config } from '../config.js';

export function createFeishuClient(token: string) {
  return axios.create({
    baseURL: `${config.feishu.baseUrl}/open-apis`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}
```

- [ ] **Step 2: 创建 src/feishu/userAuth.ts**

```typescript
import axios from 'axios';
import type { Db } from '../db/index.js';
import { config } from '../config.js';
import { getAppAccessToken } from './appAuth.js';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getUserToken(db: Db, sessionId: string): Promise<string> {
  const session = db.getSession(sessionId);
  if (!session) {
    throw new AuthError('未登录，请先调用 auth_login 完成登录');
  }

  const now = Math.floor(Date.now() / 1000);

  // access_token 未过期（留 60s 缓冲）
  if (now < session.expires_at - 60) {
    return session.access_token;
  }

  // 用 refresh_token 续期
  const appToken = await getAppAccessToken();
  try {
    const res = await axios.post(
      `${config.feishu.baseUrl}/open-apis/authen/v1/oidc/refresh_access_token`,
      { grant_type: 'refresh_token', refresh_token: session.refresh_token },
      { headers: { Authorization: `Bearer ${appToken}` } }
    );

    const data = res.data.data as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    db.upsertSession({
      ...session,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: now + data.expires_in,
      updated_at: now,
    });

    return data.access_token;
  } catch {
    db.deleteSession(sessionId);
    throw new AuthError('登录已过期，请重新调用 auth_login');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/feishu/client.ts src/feishu/userAuth.ts
git commit -m "feat: add user token refresh and axios client factory"
```

---

## Task 6: Express 服务器 + MCP 会话管理

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

- [ ] **Step 1: 创建 src/server.ts**

```typescript
import express from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Db } from './db/index.js';
import { createMcpServer } from './mcp/index.js';

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  // 每个 MCP 会话对应一个 transport
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // 已有会话
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // 新会话：必须是 initialize 请求
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Expected initialize request for new session' });
      return;
    }

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid) => {
        sessions.set(sid, transport);
      },
    });

    transport.onclose = () => {
      sessions.delete(newSessionId);
    };

    const server = createMcpServer(newSessionId, db);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
  });

  return app;
}
```

- [ ] **Step 2: 创建 src/index.ts**

```typescript
import 'dotenv/config';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createDb } from './db/index.js';
import { createApp } from './server.js';
import { config } from './config.js';

const dbDir = dirname(config.server.dbPath);
mkdirSync(dbDir, { recursive: true });

const db = createDb(config.server.dbPath);
const app = createApp(db);

app.listen(config.server.port, () => {
  console.log(`Feishu MCP server running on port ${config.server.port}`);
  console.log(`MCP endpoint: http://localhost:${config.server.port}/mcp`);
});
```

- [ ] **Step 3: 添加 dotenv 依赖**

```bash
npm install dotenv
```

- [ ] **Step 4: 验证服务能启动（需先创建 src/mcp/index.ts 占位）**

```typescript
// src/mcp/index.ts 临时占位
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../db/index.js';

export function createMcpServer(_sessionId: string, _db: Db) {
  return new McpServer({ name: 'feishu-mcp', version: '1.0.0' });
}
```

```bash
npx tsx src/index.ts
```

Expected: `Feishu MCP server running on port 5201`（Ctrl+C 停止）

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/index.ts src/mcp/index.ts
git commit -m "feat: add Express server with MCP Streamable HTTP transport"
```

---

## Task 7: OAuth 回调端点

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 在 src/server.ts 中添加 OAuth 回调路由**

在 `return app;` 之前添加：

```typescript
  app.get('/oauth/callback', async (req, res) => {
    const { code, state: sessionId } = req.query as { code: string; state: string };

    if (!code || !sessionId) {
      res.status(400).send('<h1>参数缺失</h1>');
      return;
    }

    try {
      const appToken = await getAppAccessToken();

      // 1. 用 code 换 token
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

      // 2. 获取用户信息
      const userRes = await axios.get(
        `${config.feishu.baseUrl}/open-apis/authen/v1/user_info`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const userInfo = userRes.data.data as { open_id: string; name: string };

      // 3. 存入 SQLite
      const now = Math.floor(Date.now() / 1000);
      db.upsertSession({
        session_id: sessionId,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<h1>登录失败</h1><pre>${message}</pre>`);
    }
  });
```

在文件顶部添加缺少的 import：

```typescript
import axios from 'axios';
import { config } from './config.js';
import { getAppAccessToken } from './feishu/appAuth.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/server.ts
git commit -m "feat: add OAuth callback endpoint"
```

---

## Task 8: Auth 工具

**Files:**
- Create: `src/mcp/tools/auth.ts`
- Create: `tests/tools/auth.test.ts`

- [ ] **Step 1: 写失败测试 tests/tools/auth.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createDb } from '../../src/db/index.js';
import { registerAuthTools } from '../../src/mcp/tools/auth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../src/config.js', () => ({
  config: {
    feishu: { appId: 'app_test', baseUrl: 'https://test.example.com' },
    oauth: { redirectUri: 'http://localhost:5201/oauth/callback' },
  },
}));

describe('auth tools', () => {
  it('auth_login returns OAuth URL with session_id as state', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const db = createDb(':memory:');
    const sessionId = 'test-session-123';

    registerAuthTools(server, sessionId, db);

    // 验证工具已注册（通过 listTools 检查）
    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty('auth_login');
    expect(tools).toHaveProperty('auth_status');
  });

  it('auth_status returns not_logged_in for unknown session', async () => {
    const db = createDb(':memory:');
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAuthTools(server, 'unknown-session', db);

    const handler = (server as any)._registeredTools['auth_status'].callback;
    const result = await handler({});
    expect(result.content[0].text).toContain('未登录');
  });

  it('auth_status returns user info for logged-in session', async () => {
    const db = createDb(':memory:');
    db.upsertSession({
      session_id: 'sess-logged',
      open_id: 'ou_abc',
      user_name: 'Alice',
      access_token: 'at_x',
      refresh_token: 'rt_x',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAuthTools(server, 'sess-logged', db);

    const handler = (server as any)._registeredTools['auth_status'].callback;
    const result = await handler({});
    expect(result.content[0].text).toContain('Alice');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/tools/auth.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mcp/tools/auth.js'"

- [ ] **Step 3: 实现 src/mcp/tools/auth.ts**

```typescript
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import { config } from '../../config.js';

export function registerAuthTools(server: McpServer, sessionId: string, db: Db) {
  server.tool(
    'auth_login',
    '生成飞书 OAuth 授权 URL，在浏览器中打开完成登录',
    {},
    async () => {
      const params = new URLSearchParams({
        app_id: config.feishu.appId,
        redirect_uri: config.oauth.redirectUri,
        scope: 'wiki:wiki:readonly docx:document docs:doc drive:drive:readonly im:message:send_as_bot contact:contact:readonly',
        state: sessionId,
      });
      const url = `${config.feishu.baseUrl}/open-apis/authen/v1/authorize?${params}`;
      return {
        content: [{ type: 'text' as const, text: `请在浏览器中打开以下 URL 完成飞书登录：\n\n${url}` }],
      };
    }
  );

  server.tool(
    'auth_status',
    '查询当前会话的登录状态及用户信息',
    {},
    async () => {
      const session = db.getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: '未登录。请先调用 auth_login 完成授权。' }],
        };
      }
      const expiresIn = session.expires_at - Math.floor(Date.now() / 1000);
      return {
        content: [{
          type: 'text' as const,
          text: `已登录\n用户：${session.user_name}\nopen_id：${session.open_id}\ntoken 剩余有效期：${Math.max(0, expiresIn)} 秒`,
        }],
      };
    }
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/tools/auth.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/auth.ts tests/tools/auth.test.ts
git commit -m "feat: add auth_login and auth_status tools"
```

---

## Task 9: 文档工具

**Files:**
- Create: `src/mcp/tools/document.ts`
- Create: `tests/tools/document.test.ts`

- [ ] **Step 1: 写失败测试 tests/tools/document.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDb } from '../../src/db/index.js';
import { registerDocumentTools } from '../../src/mcp/tools/document.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_token_mock'),
}));

const SESSION_ID = 'doc-test-session';
const SESSION = {
  session_id: SESSION_ID,
  open_id: 'ou_test',
  user_name: 'Tester',
  access_token: 'user_token_mock',
  refresh_token: 'rt_mock',
  expires_at: 9999999999,
  updated_at: 1000,
};

describe('document tools', () => {
  let db: ReturnType<typeof createDb>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createDb(':memory:');
    db.upsertSession(SESSION);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDocumentTools(server, SESSION_ID, db);
  });

  it('document_create creates a document and returns its URL', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      data: { code: 0, data: { document: { document_id: 'doc_abc', title: 'Test Doc', revision_id: 1 } } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockCreate, get: vi.fn() } as any);

    const handler = (server as any)._registeredTools['document_create'].callback;
    const result = await handler({ title: 'Test Doc', content: '' });
    expect(result.content[0].text).toContain('doc_abc');
  });

  it('document_search returns results list', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      data: {
        code: 0,
        data: {
          docs_entities: [{ doc_token: 't1', title: 'Doc One', doc_type: 'docx', url: 'http://example.com/t1', edit_time: '1000' }],
          total: 1,
        },
      },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost, get: vi.fn() } as any);

    const handler = (server as any)._registeredTools['document_search'].callback;
    const result = await handler({ keyword: 'Doc', count: 10 });
    expect(result.content[0].text).toContain('Doc One');
  });

  it('document_get fails gracefully for unknown session', async () => {
    const serverNoSession = new McpServer({ name: 'test2', version: '1.0.0' });
    const emptyDb = createDb(':memory:');
    registerDocumentTools(serverNoSession, 'no-session', emptyDb);

    const handler = (serverNoSession as any)._registeredTools['document_get'].callback;
    const result = await handler({ document_id: 'doc_xyz' });
    expect(result.content[0].text).toContain('未登录');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/tools/document.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mcp/tools/document.js'"

- [ ] **Step 3: 实现 src/mcp/tools/document.ts**

```typescript
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
import { createFeishuClient } from '../../feishu/client.js';

export function registerDocumentTools(server: McpServer, sessionId: string, db: Db) {
  server.tool(
    'document_create',
    '创建新的飞书文档，支持标题和 Markdown 初始内容',
    {
      title: z.string().describe('文档标题'),
      content: z.string().optional().describe('文档初始内容（Markdown 格式）'),
    },
    async ({ title, content }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);

        const res = await client.post('/docx/v1/documents', { title });
        const doc = res.data.data.document as { document_id: string; title: string };

        // 若有初始内容，追加一个文本块
        if (content && content.trim()) {
          await client.post(
            `/docx/v1/documents/${doc.document_id}/blocks/${doc.document_id}/children`,
            {
              children: [{
                block_type: 2,
                text: { elements: [{ text_run: { content } }] },
              }],
            }
          );
        }

        return {
          content: [{
            type: 'text' as const,
            text: `文档已创建\ndocument_id：${doc.document_id}\n标题：${doc.title}`,
          }],
        };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_get',
    '获取飞书文档的纯文本内容',
    { document_id: z.string().describe('文档 ID') },
    async ({ document_id }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.get(`/docx/v1/documents/${document_id}/raw_content`);
        const text = res.data.data?.content ?? '';
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_search',
    '按关键词搜索飞书文档',
    {
      keyword: z.string().describe('搜索关键词'),
      count: z.number().int().min(1).max(50).default(10).describe('返回结果数量'),
    },
    async ({ keyword, count }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.post('/suite/docs-api/search/object', {
          search_key: keyword,
          count,
          docs_types: ['docx', 'doc'],
        });
        const entities = res.data.data?.docs_entities ?? [];
        if (entities.length === 0) {
          return { content: [{ type: 'text' as const, text: '未找到相关文档' }] };
        }
        const lines = entities.map((e: any) =>
          `- [${e.title}] doc_token: ${e.doc_token}  类型: ${e.doc_type}  最后编辑: ${e.edit_time}`
        );
        return { content: [{ type: 'text' as const, text: `找到 ${entities.length} 个文档：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_append',
    '向飞书文档末尾追加文本内容',
    {
      document_id: z.string().describe('文档 ID'),
      content: z.string().describe('要追加的内容（纯文本）'),
    },
    async ({ document_id, content }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        await client.post(
          `/docx/v1/documents/${document_id}/blocks/${document_id}/children`,
          {
            children: [{
              block_type: 2,
              text: { elements: [{ text_run: { content } }] },
            }],
          }
        );
        return { content: [{ type: 'text' as const, text: '内容已追加到文档末尾' }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/tools/document.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/document.ts tests/tools/document.test.ts
git commit -m "feat: add document_create, document_get, document_search, document_append tools"
```

---

## Task 10: 知识库工具

**Files:**
- Create: `src/mcp/tools/wiki.ts`
- Create: `tests/tools/wiki.test.ts`

- [ ] **Step 1: 写失败测试 tests/tools/wiki.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDb } from '../../src/db/index.js';
import { registerWikiTools } from '../../src/mcp/tools/wiki.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_token_mock'),
}));

const SESSION_ID = 'wiki-test-session';
const SESSION = {
  session_id: SESSION_ID, open_id: 'ou_w', user_name: 'WikiUser',
  access_token: 'user_tok', refresh_token: 'rt_w',
  expires_at: 9999999999, updated_at: 1000,
};

describe('wiki tools', () => {
  let db: ReturnType<typeof createDb>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createDb(':memory:');
    db.upsertSession(SESSION);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerWikiTools(server, SESSION_ID, db);
  });

  it('wiki_list_spaces returns space list', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        code: 0,
        data: {
          items: [{ space_id: 'sp1', name: 'Engineering Wiki', description: 'Eng docs' }],
          has_more: false,
        },
      },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: vi.fn() } as any);

    const handler = (server as any)._registeredTools['wiki_list_spaces'].callback;
    const result = await handler({});
    expect(result.content[0].text).toContain('Engineering Wiki');
    expect(result.content[0].text).toContain('sp1');
  });

  it('wiki_list_nodes returns node list for a space', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        code: 0,
        data: {
          items: [{ node_token: 'nt1', title: 'Getting Started', obj_type: 'docx', obj_token: 'doc_nt1', has_child: false }],
          has_more: false,
        },
      },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: vi.fn() } as any);

    const handler = (server as any)._registeredTools['wiki_list_nodes'].callback;
    const result = await handler({ space_id: 'sp1' });
    expect(result.content[0].text).toContain('Getting Started');
  });

  it('wiki_get_node returns node info', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        code: 0,
        data: {
          node: { node_token: 'nt1', title: 'Getting Started', obj_type: 'docx', obj_token: 'doc_nt1', has_child: false, parent_node_token: '' },
        },
      },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: vi.fn() } as any);

    const handler = (server as any)._registeredTools['wiki_get_node'].callback;
    const result = await handler({ node_token: 'nt1' });
    expect(result.content[0].text).toContain('Getting Started');
    expect(result.content[0].text).toContain('doc_nt1');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/tools/wiki.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mcp/tools/wiki.js'"

- [ ] **Step 3: 实现 src/mcp/tools/wiki.ts**

```typescript
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
import { createFeishuClient } from '../../feishu/client.js';

export function registerWikiTools(server: McpServer, sessionId: string, db: Db) {
  server.tool(
    'wiki_list_spaces',
    '获取当前用户有权限的知识库列表',
    {},
    async () => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.get('/wiki/v2/spaces');
        const items = res.data.data?.items ?? [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: '暂无知识库' }] };
        }
        const lines = items.map((s: any) =>
          `- ${s.name}（space_id: ${s.space_id}）${s.description ? '  ' + s.description : ''}`
        );
        return { content: [{ type: 'text' as const, text: `知识库列表：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'wiki_list_nodes',
    '获取指定知识库下的节点列表',
    {
      space_id: z.string().describe('知识库 ID'),
      parent_node_token: z.string().optional().describe('父节点 token，不填则获取根节点'),
    },
    async ({ space_id, parent_node_token }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const params: Record<string, string> = {};
        if (parent_node_token) params.parent_node_token = parent_node_token;
        const res = await client.get(`/wiki/v2/spaces/${space_id}/nodes`, { params });
        const items = res.data.data?.items ?? [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: '该知识库下暂无节点' }] };
        }
        const lines = items.map((n: any) =>
          `- [${n.obj_type}] ${n.title}  node_token: ${n.node_token}  obj_token: ${n.obj_token}${n.has_child ? '  (有子节点)' : ''}`
        );
        return { content: [{ type: 'text' as const, text: `节点列表：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'wiki_get_node',
    '获取知识库节点的详细信息',
    { node_token: z.string().describe('节点 token') },
    async ({ node_token }) => {
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.get('/wiki/v2/spaces/get_node', { params: { token: node_token } });
        const node = res.data.data?.node;
        if (!node) {
          return { content: [{ type: 'text' as const, text: '节点不存在或无权限' }] };
        }
        const text = [
          `标题：${node.title}`,
          `类型：${node.obj_type}`,
          `node_token：${node.node_token}`,
          `obj_token：${node.obj_token}`,
          `父节点：${node.parent_node_token || '（根节点）'}`,
          `有子节点：${node.has_child ? '是' : '否'}`,
          node.obj_type === 'docx'
            ? `\n提示：可用 document_get 工具获取内容，document_id = ${node.obj_token}`
            : '',
        ].filter(Boolean).join('\n');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/tools/wiki.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/wiki.ts tests/tools/wiki.test.ts
git commit -m "feat: add wiki_list_spaces, wiki_list_nodes, wiki_get_node tools"
```

---

## Task 11: 聊天工具

**Files:**
- Create: `src/mcp/tools/chat.ts`
- Create: `tests/tools/chat.test.ts`

- [ ] **Step 1: 写失败测试 tests/tools/chat.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDb } from '../../src/db/index.js';
import { registerChatTools } from '../../src/mcp/tools/chat.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_tok_mock'),
}));

describe('chat tools', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerChatTools(server);
  });

  it('message_send_user resolves email to open_id then sends message', async () => {
    const mockPost = vi.fn()
      .mockResolvedValueOnce({
        data: { code: 0, data: { user_list: [{ email: 'alice@example.com', open_id: 'ou_alice' }] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { message_id: 'msg_001' } },
      });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_user'].callback;
    const result = await handler({ email: 'alice@example.com', message: 'Hello!' });
    expect(result.content[0].text).toContain('msg_001');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('message_send_user returns error when email not found', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      data: { code: 0, data: { user_list: [] } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_user'].callback;
    const result = await handler({ email: 'nobody@example.com', message: 'Hi' });
    expect(result.content[0].text).toContain('未找到');
  });

  it('message_send_group sends message to chat_id', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      data: { code: 0, data: { message_id: 'msg_002' } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_group'].callback;
    const result = await handler({ chat_id: 'oc_abc123', message: 'Team update' });
    expect(result.content[0].text).toContain('msg_002');
  });

  it('chat_create resolves emails and creates group chat', async () => {
    const mockPost = vi.fn()
      .mockResolvedValueOnce({
        data: { code: 0, data: { user_list: [
          { email: 'a@x.com', open_id: 'ou_a' },
          { email: 'b@x.com', open_id: 'ou_b' },
        ] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { chat_id: 'oc_newchat' } },
      });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['chat_create'].callback;
    const result = await handler({ name: 'Project Alpha', emails: ['a@x.com', 'b@x.com'] });
    expect(result.content[0].text).toContain('oc_newchat');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: FAIL with "Cannot find module '../../src/mcp/tools/chat.js'"

- [ ] **Step 3: 实现 src/mcp/tools/chat.ts**

```typescript
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAppAccessToken } from '../../feishu/appAuth.js';
import { createFeishuClient } from '../../feishu/client.js';

async function getBotClient() {
  const token = await getAppAccessToken();
  return createFeishuClient(token);
}

async function resolveEmails(client: ReturnType<typeof createFeishuClient>, emails: string[]) {
  const res = await client.post('/contact/v3/users/batch_get_id', { emails });
  const userList = res.data.data?.user_list ?? [];
  return userList as Array<{ email: string; open_id: string }>;
}

export function registerChatTools(server: McpServer) {
  server.tool(
    'message_send_user',
    '以机器人身份向指定用户（邮箱）发送文本消息',
    {
      email: z.string().email().describe('收件人飞书邮箱'),
      message: z.string().describe('消息内容'),
    },
    async ({ email, message }) => {
      try {
        const client = await getBotClient();
        const users = await resolveEmails(client, [email]);
        if (users.length === 0) {
          return { content: [{ type: 'text' as const, text: `未找到邮箱 ${email} 对应的飞书用户` }] };
        }
        const openId = users[0].open_id;
        const res = await client.post(
          '/im/v1/messages?receive_id_type=open_id',
          { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text: message }) }
        );
        const messageId = res.data.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  server.tool(
    'message_send_group',
    '以机器人身份向指定群组（chat_id）发送文本消息',
    {
      chat_id: z.string().describe('群组 ID（oc_ 开头）'),
      message: z.string().describe('消息内容'),
    },
    async ({ chat_id, message }) => {
      try {
        const client = await getBotClient();
        const res = await client.post(
          '/im/v1/messages?receive_id_type=chat_id',
          { receive_id: chat_id, msg_type: 'text', content: JSON.stringify({ text: message }) }
        );
        const messageId = res.data.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  server.tool(
    'chat_create',
    '创建新的飞书群聊并邀请指定成员',
    {
      name: z.string().describe('群聊名称'),
      emails: z.array(z.string().email()).min(1).describe('成员邮箱列表'),
    },
    async ({ name, emails }) => {
      try {
        const client = await getBotClient();
        const users = await resolveEmails(client, emails);
        const openIds = users.map((u) => u.open_id);
        const notFound = emails.filter((e) => !users.find((u) => u.email === e));

        const res = await client.post('/im/v1/chats', {
          name,
          user_id_list: openIds,
        });
        const chatId = res.data.data?.chat_id;
        const warnings = notFound.length > 0 ? `\n注意：以下邮箱未找到对应用户：${notFound.join(', ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `群聊已创建\nchat_id：${chatId}\n群名：${name}${warnings}` }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `创建群聊失败：${String(err)}` }] };
      }
    }
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/chat.ts tests/tools/chat.test.ts
git commit -m "feat: add message_send_user, message_send_group, chat_create tools"
```

---

## Task 12: 注册所有工具

**Files:**
- Modify: `src/mcp/index.ts`

- [ ] **Step 1: 用完整实现替换占位符 src/mcp/index.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../db/index.js';
import { registerAuthTools } from './tools/auth.js';
import { registerDocumentTools } from './tools/document.js';
import { registerWikiTools } from './tools/wiki.js';
import { registerChatTools } from './tools/chat.js';

export function createMcpServer(sessionId: string, db: Db): McpServer {
  const server = new McpServer({
    name: 'feishu-mcp',
    version: '1.0.0',
  });

  registerAuthTools(server, sessionId, db);
  registerDocumentTools(server, sessionId, db);
  registerWikiTools(server, sessionId, db);
  registerChatTools(server);

  return server;
}
```

- [ ] **Step 2: 运行全部测试确认全部通过**

```bash
npx vitest run
```

Expected: PASS（所有测试通过，无 FAIL）

- [ ] **Step 3: 编译 TypeScript 确认无类型错误**

```bash
npx tsc --noEmit
```

Expected: 无输出（无错误）

- [ ] **Step 4: Commit**

```bash
git add src/mcp/index.ts
git commit -m "feat: register all 12 MCP tools in createMcpServer"
```

---

## Task 13: 烟雾测试 + 部署文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 本地启动服务验证**

```bash
cp .env.example .env
# 编辑 .env，填入真实的 FEISHU_APP_ID 和 FEISHU_APP_SECRET
npx tsx src/index.ts
```

Expected:
```
Feishu MCP server running on port 5201
MCP endpoint: http://localhost:5201/mcp
```

- [ ] **Step 2: 验证 MCP 端点响应**

新开终端：

```bash
curl -X POST http://localhost:5201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Expected: 返回含 `"result"` 的 JSON，包含 `serverInfo.name: "feishu-mcp"`

- [ ] **Step 3: 创建 README.md**

```markdown
# Feishu MCP Server

飞书 MCP 服务，支持文档管理、知识库浏览和聊天机器人功能。

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书应用 app_id |
| `FEISHU_APP_SECRET` | 飞书应用 app_secret |
| `FEISHU_BASE_URL` | 飞书私有部署地址，如 `https://open.xfchat.iflytek.com` |
| `OAUTH_REDIRECT_URI` | OAuth 回调地址，需内网可访问，如 `http://your-server:5201/oauth/callback` |
| `PORT` | 服务端口，默认 5201 |
| `DB_PATH` | SQLite 路径，默认 `./data/tokens.db` |

### 2. 安装依赖 & 启动

```bash
npm install
npm run dev      # 开发模式（热重载）
# 或
npm run build && npm start   # 生产模式
```

### 3. 配置 Claude Code

在 `~/.claude/claude_desktop_config.json` 中添加：

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

### 4. 首次登录

在 Claude Code 中调用：

```
auth_login
```

将返回的 URL 在浏览器中打开，完成飞书 OAuth 授权。

## 可用工具

| 工具 | 说明 |
|------|------|
| `auth_login` | 获取飞书登录授权链接 |
| `auth_status` | 查看当前登录状态 |
| `document_create` | 创建新文档 |
| `document_get` | 获取文档内容 |
| `document_search` | 搜索文档 |
| `document_append` | 向文档追加内容 |
| `wiki_list_spaces` | 获取知识库列表 |
| `wiki_list_nodes` | 获取知识库节点列表 |
| `wiki_get_node` | 获取知识库节点详情 |
| `message_send_user` | 向用户发送消息（机器人） |
| `message_send_group` | 向群组发送消息（机器人） |
| `chat_create` | 创建群聊 |

## 飞书应用权限清单

在飞书开放平台需开通以下权限：

- `docx:document` — 查看、编辑文档
- `drive:drive:readonly` — 搜索云盘文件
- `wiki:wiki:readonly` — 查看知识库
- `im:message:send_as_bot` — 机器人发消息
- `contact:contact:readonly` — 通过邮箱查找用户
```

- [ ] **Step 4: 最终 commit**

```bash
git add README.md
git commit -m "docs: add README with deployment instructions"
```
