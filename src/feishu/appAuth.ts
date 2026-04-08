import axios from 'axios';
import { config } from '../config.js';

let cachedToken: string | null = null;
let expiresAt = 0;

export async function getAppAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < expiresAt - 60) {
    return cachedToken;
  }

  const res = await axios.post(
    `${config.feishu.baseUrl}/open-apis/auth/v3/app_access_token/internal`,
    { app_id: config.feishu.appId, app_secret: config.feishu.appSecret }
  );

  const { app_access_token, expire } = res.data as {
    app_access_token: string;
    expire: number;
  };

  cachedToken = app_access_token;
  expiresAt = now + expire;
  return cachedToken;
}

// 仅供测试重置缓存使用
export function _resetCache() {
  cachedToken = null;
  expiresAt = 0;
}
