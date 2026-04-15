# 飞书 MCP 设计文档

**日期：** 2026-04-07  
**项目：** Xfchat-MCP  
**状态：** 已批准

---

## 背景

公司私有化部署飞书，域名为 `https://open.xfchat.iflytek.com`，使用标准飞书开放平台 API。需要构建一个 MCP 服务，部署到服务器后供多个开发者通过 Claude Code 调用，实现文档管理、知识库浏览和聊天机器人功能。

---

## 架构概览

### 整体架构

单进程 Node.js 服务，使用 MCP Streamable HTTP 传输协议。同一进程内同时承载：

- `POST /mcp` — MCP 工具端点，供 Claude Code 调用
- `GET /oauth/callback` — 飞书 OAuth 回调端点

> **V1 范围说明：** 机器人接收消息的 Webhook 回调功能（`POST /webhook/event`）**不在 V1 范围内**，待第一版验证通过后作为 V2 功能补充。

```
┌─────────────────────────────────────────────────────┐
│                   服务器 (单进程)                      │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  MCP Endpoint   │    │   OAuth Callback      │   │
│  │  POST /mcp      │    │   GET /oauth/callback │   │
│  │  (Streamable    │    │   (交换code→token)    │   │
│  │   HTTP)         │    └──────────┬───────────┘   │
│  └────────┬────────┘               │                │
│           │                        ▼                │
│           │              ┌──────────────────┐      │
│           └─────────────►│  Token Store     │      │
│                          │  (SQLite)        │      │
│                          └────────┬─────────┘      │
│                                   │                 │
│                          ┌────────▼─────────┐      │
│                          │  Feishu API      │      │
│                          │  Client          │      │
│                          └──────────────────┘      │
└─────────────────────────────────────────────────────┘
         ▲                              ▲
         │ MCP over HTTP                │ HTTPS
  多个开发者                    https://open.xfchat.iflytek.com
  (Claude Code)
```

### 技术栈

| 依赖 | 用途 |
|------|------|
| `@modelcontextprotocol/sdk` | MCP Streamable HTTP 传输 |
| `express` | HTTP 服务器 |
| `better-sqlite3` | 用户 token 持久化存储 |
| `axios` | 飞书 API HTTP 客户端 |
| TypeScript | 开发语言 |

---

## 认证方案

### 双 Token 策略

| Token 类型 | 用途 | 维护方 |
|-----------|------|--------|
| `app_access_token` | 聊天机器人发消息、创建群聊 | 服务端自动维护，对开发者透明 |
| `user_access_token` | 文档操作、知识库查询（以个人身份） | 每个开发者通过 OAuth 授权 |

### OAuth 2.0 授权流程

```
开发者                Claude Code            MCP Server         飞书
  │                       │                      │               │
  │  调用 auth_login       │                      │               │
  ├──────────────────────►│ ─── 工具调用 ────────►│               │
  │                       │                      │ 生成 state=    │
  │                       │                      │ session_id     │
  │◄──────────────────────┤◄─── 返回 OAuth URL ──┤               │
  │                       │                      │               │
  │  浏览器打开 URL        │                      │               │
  ├─────────────────────────────────────────────────────────────►│
  │                       │                      │  用户登录授权  │
  │◄─────────────────────────────────────────────────────────────┤
  │  重定向到 /oauth/callback?code=xxx&state=session_id          │
  ├─────────────────────────────────────────────────────────────►│
  │                       │                      │◄──────────────┤
  │                       │                      │ 换取 token     │
  │                       │                      │ 存入 SQLite    │
  │  浏览器显示"登录成功"  │                      │               │
  │◄─────────────────────────────────────────────┤               │
  │                       │                      │               │
  │  继续使用文档/知识库工具│                      │               │
```

### Token 生命周期

- `user_access_token`：有效期 2 小时，每次 API 调用前自动检查，过期则用 `refresh_token` 静默续期
- `refresh_token`：有效期 30 天，过期后清除会话，提示开发者重新调用 `auth_login`
- `app_access_token`：有效期 2 小时，服务端定时自动刷新

### SQLite 数据结构

```sql
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,  -- MCP 会话 ID
  open_id      TEXT,              -- 飞书用户 ID
  user_name    TEXT,              -- 用户姓名
  access_token TEXT,
  refresh_token TEXT,
  expires_at   INTEGER,           -- Unix 时间戳（秒）
  updated_at   INTEGER
);
```

---

## MCP 工具列表（共 12 个）

### 认证组

| 工具名 | 描述 | 所需 Token |
|--------|------|-----------|
| `auth_login` | 生成飞书 OAuth 授权 URL，开发者在浏览器中打开完成登录 | 无 |
| `auth_status` | 查询当前会话登录状态及用户基本信息 | 无 |

### 文档组

| 工具名 | 描述 | 所需 Token |
|--------|------|-----------|
| `document_create` | 创建新文档，支持传入标题和 Markdown 初始内容 | user_access_token |
| `document_get` | 获取文档纯文本内容 | user_access_token |
| `document_search` | 按关键词搜索文档，返回文档列表 | user_access_token |
| `document_append` | 向文档末尾追加 Markdown 格式内容 | user_access_token |

### 知识库组

| 工具名 | 描述 | 所需 Token |
|--------|------|-----------|
| `wiki_list_spaces` | 获取当前用户有权限的知识库列表 | user_access_token |
| `wiki_list_nodes` | 获取指定知识库下的节点列表 | user_access_token |
| `wiki_get_node` | 获取指定知识库节点的详细信息及内容 | user_access_token |

### 聊天组

| 工具名 | 描述 | 所需 Token |
|--------|------|-----------|
| `message_send_user` | 以机器人身份向指定用户（邮箱）发送消息 | app_access_token |
| `message_send_group` | 以机器人身份向指定群组（chat_id）发送消息 | app_access_token |
| `chat_create` | 创建新群聊并邀请指定成员（邮箱列表） | app_access_token |

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| 未登录就调用文档/知识库工具 | 返回提示"请先调用 auth_login 完成登录" |
| `access_token` 过期 | 自动用 `refresh_token` 续期后重试，对开发者透明 |
| `refresh_token` 过期 | 清除会话，返回提示"登录已过期，请重新调用 auth_login" |
| 飞书 API 返回错误 | 透传飞书错误码和错误信息，不二次包装 |
| 网络超时 | 返回明确超时错误，不静默失败 |

---

## 部署配置

### 环境变量

```env
# 飞书应用凭证
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BASE_URL=https://open.xfchat.iflytek.com

# OAuth 回调地址（需内网可访问）
OAUTH_REDIRECT_URI=https://<your-server>/oauth/callback

# 服务配置
PORT=3000
DB_PATH=./data/tokens.db
```

### 开发者 Claude Code 配置

每个开发者在 `~/.claude/claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "http://<your-server>:3000/mcp"
    }
  }
}
```

首次使用时调用 `auth_login` 完成一次性 OAuth 授权，后续自动续期，无需重复操作。

---

## 目录结构（预期）

```
Xfchat-MCP/
├── src/
│   ├── index.ts          # 入口，启动 Express + MCP server
│   ├── server.ts         # Express 路由配置
│   ├── mcp/
│   │   ├── tools/
│   │   │   ├── auth.ts       # auth_login, auth_status
│   │   │   ├── document.ts   # document_* 工具
│   │   │   ├── wiki.ts       # wiki_* 工具
│   │   │   └── chat.ts       # message_*, chat_create 工具
│   │   └── index.ts      # 注册所有工具
│   ├── feishu/
│   │   ├── client.ts     # Feishu API 封装（axios）
│   │   ├── auth.ts       # app_token 管理
│   │   └── types.ts      # API 响应类型定义
│   └── db/
│       └── index.ts      # SQLite 操作（sessions 表）
├── data/                 # SQLite 数据库文件（gitignore）
├── .env.example
├── package.json
└── tsconfig.json
```
