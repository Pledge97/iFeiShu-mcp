import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
import { createFeishuClient } from '../../feishu/client.js';
import { logToolCall } from '../logger.js';

/**
 * 注册文档相关工具：document_create、document_get、document_search、document_append。
 * 所有工具均使用 user_access_token（以开发者个人身份操作文档）。
 *
 * @param server    MCP 服务器实例
 * @param sessionId 当前会话 ID，用于从数据库获取 user token
 * @param db        数据库实例
 */
export function registerDocumentTools(server: McpServer, sessionId: string, db: Db) {
  server.tool(
    'document_create',
    '创建新的飞书文档，支持标题和初始内容',
    {
      title: z.string().describe('文档标题'),
      content: z.string().optional().describe('文档初始内容（纯文本）'),
    },
    async ({ title, content }: { title: string; content?: string }) => {
      logToolCall('document_create', { title, content });
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);

        const res = await client.post('/docx/v1/documents', { title });
        const doc = res.data.data.document as { document_id: string; title: string };

        if (content && content.trim()) {
          await client.post(
            `/docx/v1/documents/${doc.document_id}/blocks/${doc.document_id}/children`,
            {
              children: [{
                block_type: 2,
                text: { elements: [{ text_run: { content } }] },
              }],
            }
          );
        }

        return {
          content: [{
            type: 'text' as const,
            text: `文档已创建\ndocument_id：${doc.document_id}\n标题：${doc.title}`,
          }],
        };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_get',
    '获取飞书文档的纯文本内容',
    { document_id: z.string().describe('文档 ID') },
    async ({ document_id }: { document_id: string }) => {
      logToolCall('document_get', { document_id });
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.get(`/docx/v1/documents/${document_id}/raw_content`);
        const text = res.data.data?.content ?? '';
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_search',
    '按关键词搜索飞书文档',
    {
      keyword: z.string().describe('搜索关键词'),
      count: z.number().int().min(1).max(50).default(10).describe('返回结果数量'),
    },
    async ({ keyword, count }: { keyword: string; count: number }) => {
      logToolCall('document_search', { keyword, count });
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        const res = await client.post('/suite/docs-api/search/object', {
          search_key: keyword,
          count,
          docs_types: ['docx', 'doc'],
        });
        const entities = res.data.data?.docs_entities ?? [];
        if (entities.length === 0) {
          return { content: [{ type: 'text' as const, text: '未找到相关文档' }] };
        }
        const lines = entities.map((e: any) =>
          `- [${e.title}] doc_token: ${e.doc_token}  类型: ${e.doc_type}  最后编辑: ${e.edit_time}`
        );
        return { content: [{ type: 'text' as const, text: `找到 ${entities.length} 个文档：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_append',
    '向飞书文档末尾追加文本内容',
    {
      document_id: z.string().describe('文档 ID'),
      content: z.string().describe('要追加的内容（纯文本）'),
    },
    async ({ document_id, content }: { document_id: string; content: string }) => {
      logToolCall('document_append', { document_id, content });
      try {
        const token = await getUserToken(db, sessionId);
        const client = createFeishuClient(token);
        await client.post(
          `/docx/v1/documents/${document_id}/blocks/${document_id}/children`,
          {
            children: [{
              block_type: 2,
              text: { elements: [{ text_run: { content } }] },
            }],
          }
        );
        return { content: [{ type: 'text' as const, text: '内容已追加到文档末尾' }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );
}
