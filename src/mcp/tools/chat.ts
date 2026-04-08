import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAppAccessToken } from '../../feishu/appAuth.js';
import { createFeishuClient } from '../../feishu/client.js';

/**
 * 获取以机器人身份鉴权的飞书 API 客户端（使用 app_access_token）。
 * 聊天类工具统一使用机器人身份，无需用户登录。
 */
async function getBotClient() {
  const token = await getAppAccessToken();
  return createFeishuClient(token);
}

/**
 * 将邮箱列表批量解析为飞书 open_id。
 * @param client 飞书 API 客户端
 * @param emails 邮箱列表
 * @returns 包含 email 和 open_id 的用户列表
 */
async function resolveEmails(client: ReturnType<typeof createFeishuClient>, emails: string[]) {
  const res = await client.post('/contact/v3/users/batch_get_id', { emails });
  const userList = res.data.data?.user_list ?? [];
  return userList as Array<{ email: string; open_id: string }>;
}

/**
 * 注册聊天相关工具：message_send_user、message_send_group、chat_create。
 * 所有工具均使用 app_access_token（以机器人身份发送消息和创建群聊）。
 *
 * @param server MCP 服务器实例
 */
export function registerChatTools(server: McpServer) {
  server.tool(
    'message_send_user',
    '以机器人身份向指定用户（邮箱）发送文本消息',
    {
      email: z.string().email().describe('收件人飞书邮箱'),
      message: z.string().describe('消息内容'),
    },
    async ({ email, message }: { email: string; message: string }) => {
      try {
        const client = await getBotClient();
        const users = await resolveEmails(client, [email]);
        if (users.length === 0) {
          return { content: [{ type: 'text' as const, text: `未找到邮箱 ${email} 对应的飞书用户` }] };
        }
        const openId = users[0].open_id;
        const res = await client.post(
          '/im/v1/messages?receive_id_type=open_id',
          { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text: message }) }
        );
        const messageId = res.data.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送\nmessage_id：${messageId}` }] };
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
    '创建新的飞书群聊并邀请指定成员',
    {
      name: z.string().describe('群聊名称'),
      emails: z.array(z.string().email()).min(1).describe('成员邮箱列表'),
    },
    async ({ name, emails }: { name: string; emails: string[] }) => {
      try {
        const client = await getBotClient();
        const users = await resolveEmails(client, emails);
        const openIds = users.map((u) => u.open_id);
        const notFound = emails.filter((e: string) => !users.find((u) => u.email === e));

        const res = await client.post('/im/v1/chats', {
          name,
          user_id_list: openIds,
        });
        const chatId = res.data.data?.chat_id;
        const warnings = notFound.length > 0 ? `\n注意：以下邮箱未找到对应用户：${notFound.join(', ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `群聊已创建\nchat_id：${chatId}\n群名：${name}${warnings}` }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `创建群聊失败：${String(err)}` }] };
      }
    }
  );
}
