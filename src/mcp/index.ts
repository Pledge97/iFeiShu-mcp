import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../db/index.js';
import type { SessionContext } from '../feishu/types.js';
import { registerAuthTools } from './tools/auth.js';
import { registerDocumentTools } from './tools/document.js';
import { registerWikiTools } from './tools/wiki.js';
import { registerChatTools } from './tools/chat.js';

export function createMcpServer(ctx: SessionContext, db: Db): McpServer {
  const server = new McpServer({
    name: 'feishu-mcp',
    version: '1.0.0',
  });

  registerAuthTools(server, ctx, db);
  registerDocumentTools(server, ctx, db);
  registerWikiTools(server, ctx, db);
  registerChatTools(server);

  return server;
}
