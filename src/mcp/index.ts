import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../db/index.js';
import { registerAuthTools } from './tools/auth.js';
import { registerDocumentTools } from './tools/document.js';
import { registerWikiTools } from './tools/wiki.js';
import { registerChatTools } from './tools/chat.js';

/**
 * 为单个 MCP 会话创建 McpServer 实例并注册全部工具。
 * 每个开发者连接时各自拥有独立实例，sessionId 用于从数据库中查找对应的 OAuth token。
 *
 * @param sessionId MCP 会话 ID（由 StreamableHTTPServerTransport 生成）
 * @param db        SQLite 数据库实例（进程内共享）
 */
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
