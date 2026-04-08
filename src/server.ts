import express from 'express';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Db } from './db/index.js';
import { createMcpServer } from './mcp/index.js';
import { config } from './config.js';
import { getAppAccessToken } from './feishu/appAuth.js';

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Expected initialize request for new session' });
      return;
    }

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid: string) => {
        sessions.set(sid, transport);
      },
    });

    transport.onclose = () => {
      sessions.delete(newSessionId);
    };

    const server = createMcpServer(newSessionId, db);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
  });

  app.get('/oauth/callback', async (req, res) => {
    const { code, state: sessionId } = req.query as { code: string; state: string };

    if (!code || !sessionId) {
      res.status(400).send('<h1>参数缺失</h1>');
      return;
    }

    try {
      const appToken = await getAppAccessToken();

      const tokenRes = await axios.post(
        `${config.feishu.baseUrl}/open-apis/authen/v1/oidc/access_token`,
        { grant_type: 'authorization_code', code },
        { headers: { Authorization: `Bearer ${appToken}` } }
      );
      const tokenData = tokenRes.data.data as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const userRes = await axios.get(
        `${config.feishu.baseUrl}/open-apis/authen/v1/user_info`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const userInfo = userRes.data.data as { open_id: string; name: string };

      const now = Math.floor(Date.now() / 1000);
      db.upsertSession({
        session_id: sessionId,
        open_id: userInfo.open_id,
        user_name: userInfo.name,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: now + tokenData.expires_in,
        updated_at: now,
      });

      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h1>✅ 登录成功</h1>
          <p>欢迎，<strong>${userInfo.name}</strong>！</p>
          <p>您现在可以关闭此窗口，回到 Claude Code 继续使用飞书工具。</p>
        </body></html>
      `);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<h1>登录失败</h1><pre>${message}</pre>`);
    }
  });

  return app;
}
