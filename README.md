# Feishu MCP Server

飞书 MCP 服务，支持文档管理、知识库浏览和聊天机器人功能，通过 MCP Streamable HTTP 协议供多开发者使用。

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
| `OAUTH_REDIRECT_URI` | OAuth 回调地址，需服务器内网可访问，如 `http://your-server:3000/oauth/callback` |
| `PORT` | 服务端口，默认 3000 |
| `DB_PATH` | SQLite 数据库路径，默认 `./data/tokens.db` |

### 2. 安装依赖 & 启动

```bash
npm install --ignore-scripts
npm run dev      # 开发模式（热重载）
# 或
npm run build && npm start   # 生产模式
```

> **注意：** 需使用 `--ignore-scripts` 跳过原生模块编译（sql.js 为纯 JS 实现，无需编译）。

### 3. 配置 Claude Code

在 `~/.claude.json` 的 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "http",
      "url": "http://your-server:3000/mcp"
    }
  }
}
```

### 4. 首次登录

在 Claude Code 中调用：

```
auth_login
```

将返回的 URL 在浏览器中打开，完成飞书 OAuth 授权。授权成功后浏览器显示"登录成功"，即可回到 Claude Code 使用所有飞书工具。

token 会自动续期，通常只需登录一次（30 天内有效）。

## 可用工具（共 14 个）

### 认证

| 工具 | 说明 |
|------|------|
| `auth_login` | 获取飞书登录授权链接 |
| `auth_status` | 查看当前登录状态和用户信息 |

### 文档

| 工具 | 说明 |
|------|------|
| `document_create` | 创建新文档，支持标题和初始内容（支持 Markdown） |
| `document_get` | 获取文档纯文本内容 |
| `document_get_by_url` | 根据飞书 URL 获取文档内容，支持个人空间（`/docx/...`）和知识库（`/wiki/...`）链接 |
| `document_search` | 按关键词搜索文档 |
| `document_overwrite` | 清空文档并替换为新内容（支持 Markdown） |
| `document_append` | 向文档末尾追加内容（支持 Markdown） |

### 知识库

| 工具 | 说明 |
|------|------|
| `wiki_list_spaces` | 获取知识库列表 |
| `wiki_list_nodes` | 获取知识库节点列表 |
| `wiki_get_node` | 获取知识库节点详情（含 document_id 提示） |

### 聊天（机器人身份）

| 工具 | 说明 |
|------|------|
| `message_send_user` | 向指定用户发送消息，支持普通文本或卡片消息（卡片正文支持 Markdown） |
| `message_send_group` | 向指定群组发送消息，支持普通文本、@所有人、卡片消息，传入群组名称即可 |

## 飞书应用权限清单

在飞书开放平台控制台需开通以下权限：

- `docx:document` — 查看、编辑文档
- `drive:drive:readonly` — 搜索云盘文件
- `wiki:wiki:readonly` — 查看知识库
- `im:message:send_as_bot` — 机器人发消息
- `im:chat` — 查看群列表（按群名发消息）

## 技术架构

- **传输协议：** MCP Streamable HTTP（每个开发者独立会话）
- **认证：** 双 token 策略——文档/知识库用个人 OAuth token，消息发送用应用 bot token
- **存储：** sql.js（纯 JS SQLite），无需编译原生模块
- **token 刷新：** user_access_token 自动续期（2h），refresh_token 30 天有效

## 开发

```bash
npm test          # 运行测试（19 个）
npm run test:watch  # 监听模式
npx tsc --noEmit  # 类型检查
```
