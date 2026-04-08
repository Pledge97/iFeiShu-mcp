import axios from 'axios';
import { config } from '../config.js';

/**
 * 创建一个带鉴权 Header 的飞书 API axios 实例。
 * @param token Bearer token（user_access_token 或 app_access_token）
 */
export function createFeishuClient(token: string) {
  return axios.create({
    baseURL: `${config.feishu.baseUrl}/open-apis`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}
