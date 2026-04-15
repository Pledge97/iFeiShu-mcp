import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import type { SessionContext } from '../../feishu/types.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
import { createFeishuClient } from '../../feishu/client.js';
import { logToolCall } from '../logger.js';
import { markdownToFeishuBlocks, writeBlocksInBatches } from '../../feishu/markdownToBlocks.js';

export function registerDocumentTools(server: McpServer, ctx: SessionContext, db: Db) {
  server.tool(
    'document_create',
    '在根目录创建新的飞书文档，支持标题和初始内容（支持 Markdown 格式）',
    {
      title: z.string().describe('文档标题'),
      content: z.string().optional().describe('文档初始内容（支持 Markdown 格式）'),
    },
    async ({ title, content }: { title: string; content?: string }) => {
      logToolCall('document_create', { title, content });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);

        const res = await client.post('/docx/v1/documents', { title });
        const doc = res.data.document as { document_id: string; title: string };

        if (content && content.trim()) {
          const blocks = markdownToFeishuBlocks(content);
          await writeBlocksInBatches(client, doc.document_id, blocks);
        }

        return {
          content: [{
            type: 'text' as const,
            text: `文档已创建\ndocument_id：${doc.document_id}\n标题：${doc.title}\n地址：https://yf2ljykclb.xfchat.iflytek.com/docx/${doc.document_id}`,
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
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const res = await client.get(`/docx/v1/documents/${document_id}/raw_content`);
        const text = res.data?.content ?? '';
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_get_by_url',
    '根据飞书文档 URL 获取文档内容，支持个人空间文档（/docx/...）和知识库文档（/wiki/...）',
    { url: z.string().url().describe('飞书文档地址') },
    async ({ url }: { url: string }) => {
      logToolCall('document_get_by_url', { url });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);

        // 个人空间文档：.../docx/{document_id}
        const docxMatch = url.match(/\/docx\/([A-Za-z0-9]+)/);
        if (docxMatch) {
          const document_id = docxMatch[1];
          const res = await client.get(`/docx/v1/documents/${document_id}/raw_content`);
          const text = res.data?.content ?? '';
          return { content: [{ type: 'text' as const, text: `document_id：${document_id}\n\n${text}` }] };
        }

        // 知识库文档：.../wiki/{wiki_token}
        const wikiMatch = url.match(/\/wiki\/([A-Za-z0-9]+)/);
        if (wikiMatch) {
          const wikiToken = wikiMatch[1];
          const nodeRes = await client.get('/wiki/v2/spaces/get_node', { params: { token: wikiToken } });
          const node = nodeRes.data?.node;
          if (!node) {
            return { content: [{ type: 'text' as const, text: '知识库节点不存在或无权限' }] };
          }
          if (node.obj_type !== 'docx') {
            return { content: [{ type: 'text' as const, text: `该知识库节点类型为 ${node.obj_type}，暂不支持读取内容` }] };
          }
          const document_id: string = node.obj_token;
          const res = await client.get(`/docx/v1/documents/${document_id}/raw_content`);
          const text = res.data?.content ?? '';
          return { content: [{ type: 'text' as const, text: `document_id：${document_id}\n标题：${node.title}\n\n${text}` }] };
        }

        return { content: [{ type: 'text' as const, text: '无法识别的飞书文档地址，支持格式：/docx/{id} 或 /wiki/{token}' }] };
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
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const res = await client.post('/suite/docs-api/search/object', {
          search_key: keyword,
          count,
          docs_types: ['docx', 'doc'],
        });
        const entities = res.data?.docs_entities ?? [];
        if (entities.length === 0) {
          return { content: [{ type: 'text' as const, text: '未找到相关文档' }] };
        }
        const hasMore = res.data?.has_more ? `（共 ${res.data?.total} 条，仅显示前 ${entities.length} 条）` : '';
        return { content: [{ type: 'text' as const, text: `找到 ${entities.length} 个文档${hasMore}：\n${JSON.stringify(entities, null, 2)}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_overwrite',
    '编辑飞书文档（清空原始内容并替换为新内容，支持 Markdown 格式）',
    {
      document_id: z.string().describe('文档 ID'),
      content: z.string().describe('新的文档内容（支持 Markdown 格式）'),
    },
    async ({ document_id, content }: { document_id: string; content: string }) => {
      logToolCall('document_overwrite', { document_id, content });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);

        // 1. 获取根块的直接子块数量（children 字段，不含嵌套后代）
        const rootRes = await client.get(`/docx/v1/documents/${document_id}/blocks/${document_id}`);
        const directChildren: string[] = rootRes.data?.children ?? [];
        const childCount = directChildren.length;

        // 2. 一次性删除所有直接子块
        if (childCount > 0) {
          await client.delete(
            `/docx/v1/documents/${document_id}/blocks/${document_id}/children/batch_delete`,
            { data: { start_index: 0, end_index: childCount } }
          );
        }

        // 3. 解析 Markdown 并分批写入
        const newBlocks = markdownToFeishuBlocks(content);
        await writeBlocksInBatches(client, document_id, newBlocks);

        return { content: [{ type: 'text' as const, text: '文档内容已替换' }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'document_append',
    '向飞书文档末尾追加文本内容（支持 Markdown 格式）',
    {
      document_id: z.string().describe('文档 ID'),
      content: z.string().describe('要追加的内容（支持 Markdown 格式）'),
    },
    async ({ document_id, content }: { document_id: string; content: string }) => {
      logToolCall('document_append', { document_id, content });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const appendBlocks = markdownToFeishuBlocks(content);
        await writeBlocksInBatches(client, document_id, appendBlocks);
        return { content: [{ type: 'text' as const, text: '内容已追加到文档末尾' }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );
}
