import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createDb } from './db/index.js';
import { config } from './config.js';
import type { SessionContext } from './feishu/types.js';
import { createMcpServer } from './mcp/index.js';

/**
 * stdio 模式入口：通过标准输入输出与 MCP 客户端通信。
 * 单一进程，单一 session，DB 存储在用户 home 目录。
 */
export async function startStdioMode() {
  const dbDir = dirname(config.server.dbPath);
  mkdirSync(dbDir, { recursive: true });

  const db = await createDb(config.server.dbPath);

  const ctx: SessionContext = {
    mcpSessionId: 'stdio-session',
    openId: null,
  };

  const server = createMcpServer(ctx, db);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}
