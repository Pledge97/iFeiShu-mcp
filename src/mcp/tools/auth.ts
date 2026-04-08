import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Db } from '../../db/index.js'
import { config } from '../../config.js'
import { logToolCall } from '../logger.js'

/**
 * 注册认证相关工具：auth_login、auth_status。
 *
 * @param server    MCP 服务器实例
 * @param sessionId 当前会话 ID，作为 OAuth state 参数使用
 * @param db        数据库实例，用于查询登录状态
 */
export function registerAuthTools(server: McpServer, sessionId: string, db: Db) {
  server.tool('auth_login', '生成飞书 OAuth 授权 URL，在浏览器中打开完成登录', {}, async () => {
    logToolCall('auth_login', { sessionId })
    const params = new URLSearchParams({
      client_id: config.feishu.appId,
      redirect_uri: config.oauth.redirectUri,
      state: sessionId
    })
    const url = `https://accounts.xfchat.iflytek.com/open-apis/authen/v1/authorize?${params}`
    return {
      content: [{ type: 'text' as const, text: `请在浏览器中打开以下 URL 完成飞书登录：\n\n${url}` }]
    }
  })

  server.tool('auth_status', '查询当前会话的登录状态及用户信息', {}, async () => {
    logToolCall('auth_status', { sessionId })
    const session = db.getSession(sessionId)
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
