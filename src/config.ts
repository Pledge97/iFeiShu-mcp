import { homedir } from 'os';
import { join } from 'path';

/** 全局配置，从环境变量读取，启动时一次性解析。 */
export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? '',
    appSecret: process.env.FEISHU_APP_SECRET ?? '',
    baseUrl: process.env.FEISHU_BASE_URL ?? 'https://open.feishu.cn',
  },
  oauth: {
    redirectUri: process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:5201/oauth/callback',
    authUrl: process.env.OAUTH_BASE_URL ?? 'https://accounts.xfchat.iflytek.com'
  },
  server: {
    mode: process.argv.includes('--stdio') ? ('stdio' as const) : ('http' as const),
    port: parseInt(process.env.PORT ?? '3000', 10),
    dbPath: process.argv.includes('--stdio')
      ? join(homedir(), '.xfchat-mcp', 'tokens.db')
      : './data/tokens.db',
  },
};
