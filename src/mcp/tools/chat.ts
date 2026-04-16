import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAppAccessToken } from '../../feishu/appAuth.js';
import { createFeishuClient } from '../../feishu/client.js';
import { logToolCall } from '../logger.js';
import type { Db } from '../../db/index.js';
import type { SessionContext } from '../../feishu/types.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';

/** 域账号转完整邮箱，例如 zhangsan → zhangsan@iflytek.com */
function toEmail(account: string): string {
  return `${account}@iflytek.com`;
}

type CardElement = Record<string, unknown>;

/**
 * 将 Markdown 转换为飞书卡片元素数组。
 * 普通行转 markdown 元素，表格转原生 table 元素，分隔线转 hr 元素。
 */
function markdownToCardElements(markdown: string): CardElement[] {
  const lines = markdown.split('\n');
  const elements: CardElement[] = [];
  let textBuffer: string[] = [];

  function flushText() {
    const content = textBuffer.join('\n').trim();
    if (content) elements.push({ tag: 'markdown', content });
    textBuffer = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码块 → 保留到 textBuffer（markdown 元素支持代码块）
    if (line.startsWith('```')) {
      const codeLines: string[] = [line];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) { codeLines.push(lines[i]); i++; }
      textBuffer.push(codeLines.join('\n'));
      continue;
    }

    // 分隔线 → hr 元素
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushText();
      elements.push({ tag: 'hr' });
      i++; continue;
    }

    // # 标题 → **标题**
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) { textBuffer.push(`**${headingMatch[2]}**`); i++; continue; }

    // - [x] 任务已完成
    const checkedMatch = line.match(/^[\s]*[-*]\s+\[x\]\s+(.*)/i);
    if (checkedMatch) { textBuffer.push(`✅ ${checkedMatch[1]}`); i++; continue; }

    // - [ ] 任务未完成
    const uncheckedMatch = line.match(/^[\s]*[-*]\s+\[\s\]\s+(.*)/);
    if (uncheckedMatch) { textBuffer.push(`⬜ ${uncheckedMatch[1]}`); i++; continue; }

    // - 无序列表 → • 列表项
    const bulletMatch = line.match(/^[\s]*[-*+]\s+(.*)/);
    if (bulletMatch) { textBuffer.push(`• ${bulletMatch[1]}`); i++; continue; }

    // > 引用：内容已含 * 的保留原样，否则用 * 包裹
    const quoteMatch = line.match(/^>\s*(.*)/);
    if (quoteMatch) {
      const inner = quoteMatch[1];
      textBuffer.push(inner.includes('*') ? inner : `*${inner}*`);
      i++; continue;
    }

    textBuffer.push(line);
    i++;
  }

  flushText();
  return elements;
}

/**
 * 构建飞书消息体。
 * - 有 card_title：生成 interactive 卡片（标题 + 元素数组，支持表格）
 * - 无 card_title：生成普通 text 消息
 */
function buildMessage({ message, card_title }: { message: string; card_title?: string }): { msgType: string; content: string } {
  if (card_title) {
    return {
      msgType: 'interactive',
      content: JSON.stringify({
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: card_title },
          template: 'blue',
        },
        elements: markdownToCardElements(message),
      }),
    };
  }
  return { msgType: 'text', content: JSON.stringify({ text: message }) };
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
 * 使用 /user/v1/batch_get_id（需要 contact:user.id:readonly 权限）。
 * 创建群聊时飞书不支持 email 类型，必须先转换为 user_id。
 */
/* async function resolveUserIds(
  client: ReturnType<typeof createFeishuClient>,
  emails: string[]
): Promise<{ found: string[]; notFound: string[] }> {
  const res = await client.post('/contact/v3/users/batch_get_id?user_id_type=user_id', {
    emails,
  });
  // v3 响应格式：{ user_list: [{ user_id, email }] }
  const userList: Array<{ user_id?: string; email?: string }> = res.data?.user_list ?? [];
  const resolvedMap = new Map(userList.filter((u) => u.user_id).map((u) => [u.email, u.user_id!]));
  const found: string[] = [];
  const notFound: string[] = [];
  for (const email of emails) {
    const userId = resolvedMap.get(email);
    if (userId) {
      found.push(userId);
    } else {
      notFound.push(email);
    }
  }
  return { found, notFound };
} */

/**
 * 通过群名称查找机器人所在群的 chat_id。
 * 遍历 /im/v1/chats 分页结果，返回第一个名称完全匹配的 chat_id。
 */
async function resolveChatId(
  client: ReturnType<typeof createFeishuClient>,
  name: string
): Promise<string | null> {
  let pageToken: string | undefined;
  do {
    const res = await client.get('/im/v1/chats', {
      params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
    });
    const items: Array<{ chat_id: string; name: string }> = res.data?.items ?? [];
    const matched = items.find((c) => c.name === name);
    if (matched) return matched.chat_id;
    pageToken = res.data?.has_more ? res.data?.page_token : undefined;
  } while (pageToken);
  return null;
}

/**
 * 注册聊天相关工具：message_send_user、message_send_group、chat_create。
 * 所有工具均使用 app_access_token（以机器人身份发送消息和创建群聊）。
 * - 发送消息：receive_id_type=email，直接以邮箱作为收件人标识
 * - 创建群聊：先通过邮箱查询 user_id，再以 user_id 创建
 *
 * @param server MCP 服务器实例
 */
export function registerChatTools(server: McpServer, ctx: SessionContext, db: Db) {
  server.tool(
    'message_send_user',
    '以机器人身份向指定用户发送消息，传入域账号即可（如 zhangsan），支持普通文本和卡片消息',
    {
      account: z.string().describe('收件人域账号（不含 @iflytek.com）'),
      message: z.string().describe('消息内容（普通文本，或卡片消息时为正文，支持 Markdown）'),
      card_title: z.string().optional().describe('卡片标题，填写后以卡片形式发送'),
    },
    async ({ account, message, card_title }: { account: string; message: string; card_title?: string }) => {
      logToolCall('message_send_user', { account, message, card_title });
      try {
        const client = await getBotClient();
        const email = toEmail(account);
        const { msgType, content } = buildMessage({ message, card_title });
        const res = await client.post(
          '/im/v1/messages?receive_id_type=email',
          { receive_id: email, msg_type: msgType, content }
        );
        const messageId = res.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送至 ${account}\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  server.tool(
    'message_send_group',
    '以机器人身份向指定群组发送消息，传入群组名称即可，支持普通文本、@所有人、卡片消息',
    {
      name: z.string().describe('群组名称'),
      message: z.string().describe('消息内容（普通文本，或卡片消息时为正文，支持 Markdown）'),
      at_all: z.boolean().optional().describe('是否 @所有人，默认 false（卡片消息时无效）'),
      card_title: z.string().optional().describe('卡片标题，填写后以卡片形式发送'),
    },
    async ({ name, message, at_all, card_title }: { name: string; message: string; at_all?: boolean; card_title?: string }) => {
      logToolCall('message_send_group', { name, message, at_all, card_title });
      try {
        const client = await getBotClient();
        const chat_id = await resolveChatId(client, name);
        if (!chat_id) {
          return { content: [{ type: 'text' as const, text: `未找到群组「${name}」，请确认机器人已在该群中` }] };
        }

        let msgType: string;
        let content: string;

        if (card_title) {
          ({ msgType, content } = buildMessage({ message, card_title }));
        } else if (at_all) {
          msgType = 'post';
          content = JSON.stringify({
            content: [[{ tag: 'at', user_id: 'all' }, { tag: 'text', text: ` ${message}` }]],
          });
        } else {
          msgType = 'text';
          content = JSON.stringify({ text: message });
        }

        const res = await client.post(
          '/im/v1/messages?receive_id_type=chat_id',
          { receive_id: chat_id, msg_type: msgType, content }
        );
        const messageId = res.data?.message_id;
        return { content: [{ type: 'text' as const, text: `消息已发送至「${name}」\nmessage_id：${messageId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `发送失败：${String(err)}` }] };
      }
    }
  );

  /* server.tool(
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
        console.log(emails)
        const { found: userIds, notFound } = await resolveUserIds(client, emails);

        if (userIds.length === 0) {
          return { content: [{ type: 'text' as const, text: '未找到任何有效用户，群聊创建取消' }] };
        }

        const res = await client.post('/im/v1/chats?user_id_type=user_id', {
          name,
          user_id_list: userIds,
        });
        console.log(res)
        const chatId = res.data?.chat_id;
        const warnings = notFound.length > 0 ? `\n注意：以下账号未找到对应用户：${notFound.join(', ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `群聊已创建\nchat_id：${chatId}\n群名：${name}${warnings}` }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `创建群聊失败：${String(err)}` }] };
      }
    }
  ); */
}
