import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import type { Db } from '../../db/index.js'
import type { SessionContext } from '../../feishu/types.js'
import { config } from '../../config.js'
import { logToolCall } from '../logger.js'
import { createTemporaryOAuthServer } from '../oauthServer.js';

export function registerAuthTools(server: McpServer, ctx: SessionContext, db: Db) {
  let tempOAuthServer: Server | null = null;

  server.tool('auth_login', '生成飞书 OAuth 授权 URL，在浏览器中打开完成登录', {}, async () => {
    logToolCall('auth_login', { mcpSessionId: ctx.mcpSessionId })

    if (config.server.mode === 'stdio') {
      if (tempOAuthServer) {
        tempOAuthServer.close();
        tempOAuthServer = null;
      }

      const state = randomUUID();
      const params = new URLSearchParams({
        client_id: config.feishu.appId,
        redirect_uri: config.oauth.redirectUri,
        state,
        scope: 'wiki:wiki docx:document drive:drive:readonly im:message im:message:send_as_bot contact:user.employee_id:readonly',
      })
      const url = `${config.feishu.baseUrl}/open-apis/authen/v1/authorize?${params}`

      const { server: oauthServer, port } = createTemporaryOAuthServer(
        db,
        state,
        (openId) => {
          ctx.openId = openId;
          oauthServer.close();
          tempOAuthServer = null;
        },
        () => {
          oauthServer.close();
          tempOAuthServer = null;
        }
      );
      tempOAuthServer = oauthServer;

      return {
        content: [{
          type: 'text' as const,
          text: `请在浏览器中打开以下 URL 完成飞书登录：\n\n${url}\n\nstdio 模式已在本地端口 ${port} 临时监听 OAuth 回调。授权成功后可调用 auth_status 确认登录状态。`
        }]
      }
    }

    const params = new URLSearchParams({
      client_id: config.feishu.appId,
      redirect_uri: config.oauth.redirectUri,
      state: ctx.mcpSessionId,
      scope: 'wiki:wiki docx:document drive:drive:readonly im:message im:message:send_as_bot contact:user.employee_id:readonly',
    })
    const url = `${config.feishu.baseUrl}/open-apis/authen/v1/authorize?${params}`
    return {
      content: [{ type: 'text' as const, text: `请在浏览器中打开以下 URL 完成飞书登录：\n\n${url}` }]
    }
  })

  server.tool('auth_status', '查询当前会话的登录状态及用户信息', {}, async () => {
    logToolCall('auth_status', { openId: ctx.openId })
    if (!ctx.openId) {
      return {
        content: [{ type: 'text' as const, text: '未登录。请先调用 auth_login 完成授权。' }]
      }
    }
    const session = db.getSession(ctx.openId)
    if (!session) {
      return {
        content: [{ type: 'text' as const, text: '未登录。请先调用 auth_login 完成授权。' }]
      }
    }
    const expiresIn = session.expires_at - Math.floor(Date.now() / 1000)
    return {
      content: [
        {
          type: 'text' as const,
          text: `已登录\n用户：${session.user_name}\nopen_id：${session.open_id}\ntoken 剩余有效期：${Math.max(0, expiresIn)} 秒`
        }
      ]
    }
  })
}
