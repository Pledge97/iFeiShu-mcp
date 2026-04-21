# Feishu MCP Server

飞书 MCP 服务，支持文档管理、知识库浏览和聊天机器人功能

## 使用方式

### 方式一：npx 启动（推荐）

#### HTTP 模式（团队共享）

在服务器上配置环境变量并启动：

```bash
# 在服务器上创建 .env 文件
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BASE_URL=https://open.xfchat.iflytek.com
OAUTH_REDIRECT_URI=http://your-server:5201/oauth/callback
PORT=5201

# 启动服务
npx -y ifeishu-mcp
```

> **注意：** `OAUTH_REDIRECT_URI` 需要在飞书开放平台的应用配置中添加为合法回调地址，且必须是服务器可被用户浏览器访问的地址。

团队成员在 `~/.claude.json` 中配置：

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
      "args": ["-y", "ifeishu-mcp", "--stdio"],
      "env": {
        "FEISHU_APP_ID": "cli_xxx",
        "FEISHU_APP_SECRET": "xxx",
        "FEISHU_BASE_URL": "https://open.xfchat.iflytek.com",
        "OAUTH_REDIRECT_URI": "http://localhost:5201/oauth/callback",
        "FEISHU_DOC_URL": "https://yf2ljykclb.xfchat.iflytek.com"
      }
    }
  }
}
```

### 方式二：本地开发

适合需要修改源码或调试的场景。

## 本地开发快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

| 变量                 | 说明                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| `FEISHU_APP_ID`      | 飞书应用 app_id                                                                 |
| `FEISHU_APP_SECRET`  | 飞书应用 app_secret                                                             |
| `FEISHU_BASE_URL`    | 飞书私有部署地址，如 `https://open.xfchat.iflytek.com`                          |
| `OAUTH_REDIRECT_URI` | OAuth 回调地址，需服务器内网可访问，如 `http://your-server:5201/oauth/callback` |
| `PORT`               | 服务端口，默认 5201                                                             |

### 2. 安装依赖 & 启动

```bash
npm install
npm run dev      # 开发模式（热重载）
# 或
npm run build && npm start   # 生产模式

npm test          # 运行测试（17 个）
```

### 3. 配置 Claude Code

在 `~/.claude.json` 的 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "http://127.0.0.1:5201/mcp"
    }
  }
}
```

## 使用

在 Claude Code 中调用：

```
auth_login
```

将返回的 URL 在浏览器中打开，完成飞书 OAuth 授权。授权成功后浏览器显示"登录成功"，即可回到 Claude Code 使用所有飞书工具。

token 会自动续期，通常只需登录一次（30 天内有效）。

## 可用工具（共 16 个）

### 认证

| 工具          | 说明                       |
| ------------- | -------------------------- |
| `auth_login`  | 获取飞书登录授权链接       |
| `auth_status` | 查看当前登录状态和用户信息 |

### 文档

| 工具                  | 说明                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `document_create`     | 创建新文档，支持标题和初始内容（支持 Markdown）                                   |
| `document_get`        | 获取文档纯文本内容                                                                |
| `document_get_by_url` | 根据飞书 URL 获取文档内容，支持个人空间（`/docx/...`）和知识库（`/wiki/...`）链接 |
| `document_search`     | 按关键词搜索文档                                                                  |
| `document_overwrite`  | 清空文档并替换为新内容（支持 Markdown）                                           |
| `document_append`     | 向文档末尾追加内容（支持 Markdown）                                               |

### 知识库

| 工具                   | 说明                                                 |
| ---------------------- | ---------------------------------------------------- |
| `wiki_list_spaces`     | 获取知识库列表                                       |
| `wiki_list_nodes`      | 获取知识库节点列表（支持按父节点浏览目录）           |
| `wiki_get_node`        | 获取知识库节点详情（含 document_id 提示）            |
| `wiki_create_document` | 在知识库指定目录下创建新文档，支持 Markdown 初始内容 |

### 聊天（机器人身份）

| 工具                 | 说明                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `message_send_user`  | 向指定用户发送消息，支持普通文本或卡片消息（卡片正文支持 Markdown）   |
| `message_send_group` | 向指定群组发送消息，支持普通文本、@所有人、卡片消息，传入群组名称即可 |
| `chat_list`             | 列出当前登录用户可访问的会话（群聊和单聊），返回 chat_id、名称、类型（用户身份） |
| `message_get_history`   | 按 chat_id 获取会话历史消息，支持数量限制和时间范围过滤（机器人身份，仅能获取机器人所在的群消息）          |

## 飞书应用权限清单

在飞书开放平台控制台需开通以下权限：

```
wiki:wiki docx:document drive:drive:readonly im:chat:readonly im:message:readonly im:message im:message:send_as_bot im:message.group_msg contact:user.employee_id:readonly
```

### 文档与知识库权限
- `docx:document` — 查看、编辑、创建飞书文档，支持获取文档内容、追加内容、覆写文档（`document_get`、`document_append`、`document_overwrite`、`document_create` 工具需要）
- `drive:drive:readonly` — 搜索云盘文件，按关键词查找文档（`document_search` 工具需要）
- `wiki:wiki:readonly` — 查看知识库信息，获取知识库列表、节点列表、节点详情（`wiki_list_spaces`、`wiki_list_nodes`、`wiki_get_node` 工具需要）
- `wiki:wiki` — 在知识库中创建文档，支持在指定目录下新建文档（`wiki_create_document` 工具需要）

### 消息与会话权限
- `im:chat:readonly` — 读取会话列表，获取用户可访问的群聊和单聊信息（`chat_list` 工具需要）
- `im:message:readonly` — 读取消息历史，获取机器人所在群的历史消息记录（`message_get_history` 工具需要）
- `im:message` — 以用户身份发送消息，支持向个人或群组发送普通文本和富文本消息（基础消息发送能力）
- `im:message:send_as_bot` — 以机器人身份发送消息，支持发送文本、卡片、@所有人等消息类型（`message_send_user`、`message_send_group` 工具需要）
- `im:message.group_msg` — 接收群组消息事件，允许机器人接收群聊中的消息通知（消息事件订阅需要）

### 通讯录权限
- `contact:user.employee_id:readonly` — 读取用户工号信息，用于通过域账号查询用户的 open_id（`message_send_user` 按域账号发消息需要）

## 技术架构

- **传输协议：** MCP Streamable HTTP（每个开发者独立会话）
- **认证：** 双 token 策略——文档/知识库用个人 OAuth token，消息发送用应用 bot token
- **存储：** sql.js（纯 JS SQLite），无需编译原生模块
- **token 刷新：** user_access_token 自动续期（2h），refresh_token 30 天有效
- **token 存储：**
  - HTTP 模式：`./data/tokens.db`（相对于启动目录）
  - stdio 模式：`~/.ifeishu-mcp/tokens.db`（用户 home 目录，跨重启持久化）