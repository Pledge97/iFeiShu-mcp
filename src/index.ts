import 'dotenv/config';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createDb } from './db/index.js';
import { createApp } from './server.js';
import { config } from './config.js';

const dbDir = dirname(config.server.dbPath);
mkdirSync(dbDir, { recursive: true });

const db = await createDb(config.server.dbPath);
const app = createApp(db);

app.listen(config.server.port, () => {
  console.log(`Feishu MCP server running on port ${config.server.port}`);
  console.log(`MCP endpoint: http://localhost:${config.server.port}/mcp`);
});
