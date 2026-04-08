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
