import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDb } from '../../src/db/index.js';
import { registerDocumentTools } from '../../src/mcp/tools/document.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_token_mock'),
}));

const OPEN_ID = 'ou_test';
const SESSION = {
  open_id: OPEN_ID,
  user_name: 'Tester',
  access_token: 'user_token_mock',
  refresh_token: 'rt_mock',
  expires_at: 9999999999,
  updated_at: 1000,
};

describe('document tools', () => {
  let db: Awaited<ReturnType<typeof createDb>>;
  let server: McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await createDb(':memory:');
    db.upsertSession(SESSION);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    const ctx = { mcpSessionId: 'doc-test-session', openId: OPEN_ID };
    registerDocumentTools(server, ctx, db);
  });

  it('document_create creates a document and returns its id', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      code: 0, data: { document: { document_id: 'doc_abc', title: 'Test Doc', revision_id: 1 } },
    });
    vi.mocked(axios.create).mockReturnValue({
      post: mockPost,
      get: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['document_create'].handler;
    const result = await handler({ title: 'Test Doc', content: '' });
    expect(result.content[0].text).toContain('doc_abc');
  });

  it('document_search returns results list', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        docs_entities: [{ doc_token: 't1', title: 'Doc One', doc_type: 'docx', url: 'http://example.com/t1', edit_time: '1000' }],
        total: 1,
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      post: mockPost,
      get: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['document_search'].handler;
    const result = await handler({ keyword: 'Doc', count: 10 });
    expect(result.content[0].text).toContain('Doc One');
  });

  it('document_get fails gracefully for unknown session', async () => {
    const serverNoSession = new McpServer({ name: 'test2', version: '1.0.0' });
    const emptyDb = await createDb(':memory:');
    const ctx = { mcpSessionId: 'no-session', openId: null };
    registerDocumentTools(serverNoSession, ctx, emptyDb);

    const handler = (serverNoSession as any)._registeredTools['document_get'].handler;
    const result = await handler({ document_id: 'doc_xyz' });
    expect(result.content[0].text).toContain('未登录');
  });
});
