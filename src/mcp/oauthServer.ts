import express from 'express';
import axios from 'axios';
import { Server } from 'http';
import type { Db } from '../db/index.js';
import { config } from '../config.js';
import { getAppAccessToken } from '../feishu/appAuth.js';

/**
 * stdio 模式下临时启动的 OAuth 回调 server。
 * 接收飞书回调，交换 code 获取 token，存储后关闭。
 */
export function createTemporaryOAuthServer(
  db: Db,
  state: string,
  onSuccess: (openId: string) => void,
  onError: (error: string) => void
): { server: Server; port: number } {
  const app = express();

  app.get('/oauth/callback', async (req, res) => {
    const { code, state: receivedState } = req.query as { code: string; state: string };

    if (!code || !receivedState) {
      res.status(400).send('<h1>参数缺失</h1>');
      onError('OAuth callback missing code or state');
      return;
    }

    if (receivedState !== state) {
      res.status(400).send('<h1>state 参数不匹配</h1>');
      onError('OAuth state mismatch');
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

      onSuccess(userInfo.open_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<h1>登录失败</h1><pre>${message}</pre>`);
      onError(message);
    }
  });

  const url = new URL(config.oauth.redirectUri);
  const port = parseInt(url.port || '80', 10);

  const server = app.listen(port);
  return { server, port };
}
