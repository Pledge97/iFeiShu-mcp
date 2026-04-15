import axios from 'axios';
import type { Db } from '../db/index.js';
import type { SessionContext } from './types.js';
import { config } from '../config.js';
import { getAppAccessToken } from './appAuth.js';

/** 认证相关错误，工具层捕获后直接返回给用户。 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 获取当前会话的有效 user_access_token。
 *
 * 自动绑定逻辑：若 ctx.openId 为 null（重启后新连接），
 * 查询 DB 中的有效 session 数量：
 *   - 恰好 1 条 → 自动绑定，无需用户操作
 *   - 0 条或多条 → 抛出 AuthError 提示手动调用 auth_login
 *
 * - token 未过期（剩余 > 60s）：直接返回
 * - token 即将过期：用 refresh_token 静默续期
 * - refresh_token 也失效：清除后抛出 AuthError
 */
export async function getUserToken(db: Db, ctx: SessionContext): Promise<string> {
  // 自动绑定：ctx.openId 为空时尝试从 DB 恢复
  if (!ctx.openId) {
    const all = db.listSessions();
    if (all.length === 1) {
      ctx.openId = all[0].open_id;
    } else if (all.length === 0) {
      throw new AuthError('未登录，请先调用 auth_login 完成登录');
    } else {
      throw new AuthError('检测到多个用户，请先调用 auth_login 确认身份');
    }
  }

  const session = db.getSession(ctx.openId);
  if (!session) {
    throw new AuthError('未登录，请先调用 auth_login 完成登录');
  }

  const now = Math.floor(Date.now() / 1000);

  if (now < session.expires_at - 60) {
    return session.access_token;
  }

  const appToken = await getAppAccessToken();
  try {
    const res = await axios.post(
      `${config.feishu.baseUrl}/open-apis/authen/v1/oidc/refresh_access_token`,
      { grant_type: 'refresh_token', refresh_token: session.refresh_token },
      { headers: { Authorization: `Bearer ${appToken}` } }
    );

    const data = res.data.data as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    db.upsertSession({
      ...session,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: now + data.expires_in,
      updated_at: now,
    });

    return data.access_token;
  } catch {
    db.deleteSession(ctx.openId!);
    throw new AuthError('登录已过期，请重新调用 auth_login');
  }
}
