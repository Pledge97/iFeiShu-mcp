import axios from 'axios';
import { config } from '../config.js';

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
