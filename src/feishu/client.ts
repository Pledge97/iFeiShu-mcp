import axios from 'axios';
import { config } from '../config.js';

/**
 * 创建一个带鉴权 Header 的飞书 API axios 实例。
 * @param token Bearer token（user_access_token 或 app_access_token）
 */
export function createFeishuClient(token: string) {
  const client = axios.create({
    baseURL: `${config.feishu.baseUrl}/open-apis`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.response.use(
    (res) => {
      console.log(
        `[API Response] ${res.config?.method?.toUpperCase()} ${res.config?.url}`,
        JSON.stringify(res.data),
      );
      return res.data;
    },
    (err) => {
      if (err.response) {
        console.error(
          `[API Error] ${err.config?.method?.toUpperCase()} ${err.config?.url}`,
          `status=${err.response.status}`,
          JSON.stringify(err.response.data),
        );
      }
      return Promise.reject(err);
    }
  );

  return client;
}
