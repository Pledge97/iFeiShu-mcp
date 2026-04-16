import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDb } from '../../src/db/index.js';
import { registerWikiTools } from '../../src/mcp/tools/wiki.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_token_mock'),
}));

const OPEN_ID = 'ou_w';
const SESSION = {
  open_id: OPEN_ID,
  user_name: 'WikiUser',
  access_token: 'user_tok',
  refresh_token: 'rt_w',
  expires_at: 9999999999,
  updated_at: 1000,
};

describe('wiki tools', () => {
  let db: Awaited<ReturnType<typeof createDb>>;
  let server: McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await createDb(':memory:');
    db.upsertSession(SESSION);
    server = new McpServer({ name: 'test', version: '1.0.0' });
    const ctx = { mcpSessionId: 'wiki-test-session', openId: OPEN_ID };
    registerWikiTools(server, ctx, db);
  });

  it('wiki_list_spaces returns space list', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [{ space_id: 'sp1', name: 'Engineering Wiki', description: 'Eng docs' }],
        has_more: false,
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['wiki_list_spaces'].handler;
    const result = await handler({});
    expect(result.content[0].text).toContain('Engineering Wiki');
    expect(result.content[0].text).toContain('sp1');
  });

  it('wiki_list_nodes returns node list for a space', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [{ node_token: 'nt1', title: 'Getting Started', obj_type: 'docx', obj_token: 'doc_nt1', has_child: false }],
        has_more: false,
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['wiki_list_nodes'].handler;
    const result = await handler({ space_id: 'sp1' });
    expect(result.content[0].text).toContain('Getting Started');
  });

  it('wiki_get_node returns node info', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        node: { node_token: 'nt1', title: 'Getting Started', obj_type: 'docx', obj_token: 'doc_nt1', has_child: false, parent_node_token: '' },
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['wiki_get_node'].handler;
    const result = await handler({ node_token: 'nt1' });
    expect(result.content[0].text).toContain('Getting Started');
    expect(result.content[0].text).toContain('doc_nt1');
  });
});
