export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? '',
    appSecret: process.env.FEISHU_APP_SECRET ?? '',
    baseUrl: process.env.FEISHU_BASE_URL ?? 'https://open.feishu.cn',
  },
  oauth: {
    redirectUri: process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback',
  },
  server: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    dbPath: process.env.DB_PATH ?? './data/tokens.db',
  },
};
