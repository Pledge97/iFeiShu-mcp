import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAppAccessToken } from '../../feishu/appAuth.js';
import { createFeishuClient } from '../../feishu/client.js';
import { logToolCall } from '../logger.js';

/** 域账号转完整邮箱，例如 zhangsan → zhangsan@iflytek.com */
function toEmail(account: string): string {
  return `${account}@iflytek.com`;
}

/**
 * 获取以机器人身份鉴权的飞书 API 客户端（使用 app_access_token）。
 * 聊天类工具统一使用机器人身份，无需用户登录。
 */
async function getBotClient() {
  const token = await getAppAccessToken();
  return createFeishuClient(token);
}

/**
 * 通过邮箱列表批量查询飞书 user_id。
 * 使用 /user/v1/batch_get_id（需要 contact:user.employee_id:readonly 权限）。
 * 创建群聊时飞书不支持 email 类型，必须先转换为 user_id。
 */
async function resolveUserIds(
  client: ReturnType<typeof createFeishuClient>,
  emails: string[]
): Promise<{ found: string[]; notFound: string[] }> {
  const res = await client.post('/user/v1/batch_get_id', { emails });
  // v1 响应格式：{ email_users: { "email": [{ user_id, open_id }] } }
  const emailUsers: Record<string, Array<{ user_id?: string }>> = res.data.data?.email_users ?? {};
  const found: string[] = [];
  const notFound: string[] = [];
  for (const email of emails) {
    const userId = emailUsers[email]?.[0]?.user_id;
    if (userId) {
      found.push(userId);
    } else {
      notFound.push(email);
    }
  }
  return { found, notFound };
}

/**
 * 注册聊天相关工具：message_send_user、message_send_group、chat_create。
 * 所有工具均使用 app_access_token（以机器人身份发送消息和创建群聊）。
 * - 发送消息：receive_id_type=email，直接以邮箱作为收件人标识
 * - 创建群聊：先通过邮箱查询 user_id，再以 user_id 创建
 *
 * @param server MCP 服务器实例
 */
export function registerChatTools(server: McpServer) {
  server.tool(
    'message_send_user',
    '以机器人身份向指定用户发送文本消息，传入域账号即可（如 zhangsan）',
    {
      account: z.string().describe('收件人域账号（不含 @iflytek.com）'),
      message: z.string().describe('消息内容'),
    },
    async ({ account, message }: { account: string; message: string }) => {
      logToolCall('message_send_user', { account, message });
      try {
        const client = await getBotClient();
        const email = toEmail(account);
        const res = await client.post(
          '/im/v1/messages?receive_id_type=email',
          { receive_id: email, msg_type: 'text', content: JSON.stringify({ text: message }) }
        );
        const messageId = res.data.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送至 ${account}\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  server.tool(
    'message_send_group',
    '以机器人身份向指定群组（chat_id）发送文本消息',
    {
      chat_id: z.string().describe('群组 ID（oc_ 开头）'),
      message: z.string().describe('消息内容'),
    },
    async ({ chat_id, message }: { chat_id: string; message: string }) => {
      logToolCall('message_send_group', { chat_id, message });
      try {
        const client = await getBotClient();
        const res = await client.post(
          '/im/v1/messages?receive_id_type=chat_id',
          { receive_id: chat_id, msg_type: 'text', content: JSON.stringify({ text: message }) }
        );
        const messageId = res.data.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  server.tool(
    'chat_create',
    '创建新的飞书群聊并邀请指定成员，传入域账号列表即可（如 ["zhangsan", "lisi"]）',
    {
      name: z.string().describe('群聊名称'),
      accounts: z.array(z.string()).min(1).describe('成员域账号列表（不含 @iflytek.com）'),
    },
    async ({ name, accounts }: { name: string; accounts: string[] }) => {
      logToolCall('chat_create', { name, accounts });
      try {
        const client = await getBotClient();
        const emails = accounts.map(toEmail);
        const { found: userIds, notFound } = await resolveUserIds(client, emails);

        if (userIds.length === 0) {
          return { content: [{ type: 'text' as const, text: '未找到任何有效用户，群聊创建取消' }] };
        }

        const res = await client.post('/im/v1/chats', {
          name,
          user_id_list: userIds,
          user_id_type: 'user_id',
        });
        const chatId = res.data.data?.chat_id;
        const warnings = notFound.length > 0 ? `\n注意：以下账号未找到对应用户：${notFound.join(', ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `群聊已创建\nchat_id：${chatId}\n群名：${name}${warnings}` }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `创建群聊失败：${String(err)}` }] };
      }
    }
  );
}
