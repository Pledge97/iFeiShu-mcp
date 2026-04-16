import { describe, it, expect, vi } from 'vitest';
import { createDb } from '../../src/db/index.js';
import { registerAuthTools } from '../../src/mcp/tools/auth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../src/config.js', () => ({
  config: {
    feishu: { appId: 'app_test', baseUrl: 'https://test.example.com' },
    oauth: { redirectUri: 'http://localhost:5201/oauth/callback' },
    server: { mode: 'http' },
  },
}));

describe('auth tools', () => {
  it('registers auth_login and auth_status tools', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const db = await createDb(':memory:');
    const ctx = { mcpSessionId: 'test-session-123', openId: null };
    registerAuthTools(server, ctx, db);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty('auth_login');
    expect(tools).toHaveProperty('auth_status');
  });

  it('auth_status returns not_logged_in for unknown session', async () => {
    const db = await createDb(':memory:');
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const ctx = { mcpSessionId: 'unknown-session', openId: null };
    registerAuthTools(server, ctx, db);

    const handler = (server as any)._registeredTools['auth_status'].handler;
    const result = await handler({});
    expect(result.content[0].text).toContain('未登录');
  });

  it('auth_status returns user info for logged-in session', async () => {
    const db = await createDb(':memory:');
    db.upsertSession({
      open_id: 'ou_abc',
      user_name: 'Alice',
      access_token: 'at_x',
      refresh_token: 'rt_x',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const ctx = { mcpSessionId: 'sess-logged', openId: 'ou_abc' };
    registerAuthTools(server, ctx, db);

    const handler = (server as any)._registeredTools['auth_status'].handler;
    const result = await handler({});
    expect(result.content[0].text).toContain('Alice');
  });
});
