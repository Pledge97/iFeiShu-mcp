import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from '../../db/index.js';
import type { SessionContext } from '../../feishu/types.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
import { createFeishuClient } from '../../feishu/client.js';
import { logToolCall } from '../logger.js';
import { markdownToFeishuBlocks, writeBlocksInBatches } from '../../feishu/markdownToBlocks.js';
import { config } from '../../config.js';

export function registerWikiTools(server: McpServer, ctx: SessionContext, db: Db) {
  server.tool(
    'wiki_list_spaces',
    '获取当前用户有权限的知识库列表',
    {},
    async () => {
      logToolCall('wiki_list_spaces', {});
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const res = await client.get('/wiki/v2/spaces');
        const items = res.data?.items ?? [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: '暂无知识库' }] };
        }
        const lines = items.map((s: any) =>
          `- ${s.name}（space_id: ${s.space_id}）${s.description ? '  ' + s.description : ''}`
        );
        return { content: [{ type: 'text' as const, text: `知识库列表：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'wiki_list_nodes',
    '获取指定知识库下的节点列表',
    {
      space_id: z.string().describe('知识库 ID'),
      parent_node_token: z.string().optional().describe('父节点 token，不填则获取根节点'),
    },
    async ({ space_id, parent_node_token }: { space_id: string; parent_node_token?: string }) => {
      logToolCall('wiki_list_nodes', { space_id, parent_node_token });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const params: Record<string, string> = {};
        if (parent_node_token) params.parent_node_token = parent_node_token;
        const res = await client.get(`/wiki/v2/spaces/${space_id}/nodes`, { params });
        const items = res.data?.items ?? [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: '该知识库下暂无节点' }] };
        }
        const lines = items.map((n: any) =>
          `- [${n.obj_type}] ${n.title}  node_token: ${n.node_token}  obj_token: ${n.obj_token}${n.has_child ? '  (有子节点)' : ''}`
        );
        return { content: [{ type: 'text' as const, text: `节点列表：\n${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'wiki_get_node',
    '获取知识库节点的详细信息',
    { node_token: z.string().describe('节点 token') },
    async ({ node_token }: { node_token: string }) => {
      logToolCall('wiki_get_node', { node_token });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);
        const res = await client.get('/wiki/v2/spaces/get_node', { params: { token: node_token } });
        const node = res.data?.node;
        if (!node) {
          return { content: [{ type: 'text' as const, text: '节点不存在或无权限' }] };
        }
        const text = [
          `标题：${node.title}`,
          `类型：${node.obj_type}`,
          `node_token：${node.node_token}`,
          `obj_token：${node.obj_token}`,
          `父节点：${node.parent_node_token || '（根节点）'}`,
          `有子节点：${node.has_child ? '是' : '否'}`,
          node.obj_type === 'docx'
            ? `\n提示：可用 document_get 工具获取内容，document_id = ${node.obj_token}`
            : '',
        ].filter(Boolean).join('\n');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );

  server.tool(
    'wiki_create_document',
    '在知识库指定目录下创建新文档，支持 Markdown 初始内容',
    {
      space_id: z.string().describe('知识库 ID'),
      parent_node_token: z.string().describe('父节点 token（目录节点），填知识库根节点 token 则创建在顶层'),
      title: z.string().describe('文档标题'),
      content: z.string().optional().describe('文档初始内容（支持 Markdown 格式）'),
    },
    async ({ space_id, parent_node_token, title, content }: {
      space_id: string;
      parent_node_token: string;
      title: string;
      content?: string;
    }) => {
      logToolCall('wiki_create_document', { space_id, parent_node_token, title });
      try {
        const token = await getUserToken(db, ctx);
        const client = createFeishuClient(token);

        // 在知识库指定目录下创建文档节点
        const res = await client.post(`/wiki/v2/spaces/${space_id}/nodes`, {
          obj_type: 'docx',
          parent_node_token,
          node_type: 'origin',
          title,
        });
        const node = res.data?.node as { node_token: string; obj_token: string; title: string } | undefined;
        if (!node) {
          return { content: [{ type: 'text' as const, text: '创建失败：未返回节点信息' }] };
        }

        // 写入初始内容
        if (content && content.trim()) {
          const blocks = markdownToFeishuBlocks(content);
          await writeBlocksInBatches(client, node.obj_token, blocks);
        }

        return {
          content: [{
            type: 'text' as const,
            text: [
              `文档已在知识库中创建`,
              `标题：${title}`,
              `node_token：${node.node_token}`,
              `document_id：${node.obj_token}`,
              `地址：${config.feishu.docUrl}/wiki/${node.node_token}`,
            ].join('\n'),
          }],
        };
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      }
    }
  );
}
