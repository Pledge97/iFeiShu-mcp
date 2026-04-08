import axios from 'axios';
import type { Db } from '../db/index.js';
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
 * 获取指定会话的有效 user_access_token。
 * - token 未过期（剩余 > 60s）：直接返回缓存值
 * - token 即将过期：用 refresh_token 静默续期后返回新 token
 * - refresh_token 也失效：清除会话并抛出 AuthError，提示用户重新登录
 */
export async function getUserToken(db: Db, sessionId: string): Promise<string> {
  const session = db.getSession(sessionId);
  if (!session) {
    throw new AuthError('未登录，请先调用 auth_login 完成登录');
  }

  const now = Math.floor(Date.now() / 1000);

  // access_token 未过期（留 60s 缓冲）
  if (now < session.expires_at - 60) {
    return session.access_token;
  }

  // 用 refresh_token 续期
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
    db.deleteSession(sessionId);
    throw new AuthError('登录已过期，请重新调用 auth_login');
  }
}
