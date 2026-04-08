import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../db/index.js';

export function createMcpServer(_sessionId: string, _db: Db) {
  return new McpServer({ name: 'feishu-mcp', version: '1.0.0' });
}
