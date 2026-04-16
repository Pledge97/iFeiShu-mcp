import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChatTools } from '../../src/mcp/tools/chat.js';
import type { Db } from '../../src/db/index.js';
import type { SessionContext } from '../../src/feishu/types.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_tok_mock'),
}));
vi.mock('../../src/feishu/userAuth.js', () => ({
  getUserToken: vi.fn().mockResolvedValue('user_tok_mock'),
  AuthError: class AuthError extends Error {},
}));

describe('chat tools', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    const mockDb = {} as Db;
    const mockCtx: SessionContext = { mcpSessionId: 'test-session', openId: 'test-open-id' };
    registerChatTools(server, mockCtx, mockDb);
  });

  it('message_send_user sends message directly via email', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      code: 0,
      data: { message_id: 'msg_001' },
    });
    vi.mocked(axios.create).mockReturnValue({
      post: mockPost,
      get: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['message_send_user'].handler;
    const result = await handler({ account: 'alice', message: 'Hello!' });
    expect(result.content[0].text).toContain('msg_001');
    expect(result.content[0].text).toContain('alice');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/im/v1/messages?receive_id_type=email',
      expect.objectContaining({ receive_id: 'alice@iflytek.com' })
    );
  });

  it('message_send_group sends message to resolved chat_id', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: { items: [{ chat_id: 'oc_abc123', name: 'Project Alpha' }], has_more: false },
    });
    const mockPost = vi.fn().mockResolvedValue({
      code: 0,
      data: { message_id: 'msg_002' },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: mockPost,
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['message_send_group'].handler;
    const result = await handler({ name: 'Project Alpha', message: 'Team update' });
    expect(result.content[0].text).toContain('msg_002');
  });

  it('chat_list returns user chats with pagination', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [
          { chat_id: 'oc_123', name: 'Team Chat', chat_mode: 'group' },
          { chat_id: 'oc_456', name: 'Direct Message', chat_mode: 'p2p' },
        ],
        has_more: false,
        page_token: '',
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['chat_list']?.handler;
    expect(handler).toBeDefined();
    const result = await handler({ count: 20 });
    expect(result.content[0].text).toContain('oc_123');
    expect(result.content[0].text).toContain('Team Chat');
    expect(mockGet).toHaveBeenCalledWith('/im/v1/chats', expect.objectContaining({
      params: expect.objectContaining({ page_size: 20 }),
    }));
  });

  it('message_get_history returns chat messages', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            message_id: 'om_001',
            create_time: '1713254400',
            msg_type: 'text',
            body: { content: '{"text":"Hello"}' },
            sender: { id: 'ou_123', sender_type: 'user' },
          },
          {
            message_id: 'om_002',
            create_time: '1713254500',
            msg_type: 'text',
            body: { content: '{"text":"World"}' },
            sender: { id: 'ou_456', sender_type: 'user' },
          },
        ],
        has_more: false,
      },
    });
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet,
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    } as any);

    const handler = (server as any)._registeredTools['message_get_history']?.handler;
    expect(handler).toBeDefined();
    const result = await handler({ chat_id: 'oc_test123', count: 20 });
    expect(result.content[0].text).toContain('om_001');
    expect(result.content[0].text).toContain('Hello');
    expect(mockGet).toHaveBeenCalledWith('/im/v1/messages', expect.objectContaining({
      params: expect.objectContaining({
        container_id_type: 'chat',
        container_id: 'oc_test123',
      }),
    }));
  });

  it('chat_list returns auth error when not logged in', async () => {
    const { getUserToken } = await import('../../src/feishu/userAuth.js');
    vi.mocked(getUserToken).mockRejectedValueOnce(new Error('未登录，请先调用 auth_login'));

    const handler = (server as any)._registeredTools['chat_list'].handler;
    const result = await handler({ count: 20 });
    expect(result.content[0].text).toContain('未登录');
  });

  it('message_get_history returns auth error when not logged in', async () => {
    const { getUserToken } = await import('../../src/feishu/userAuth.js');
    vi.mocked(getUserToken).mockRejectedValueOnce(new Error('未登录，请先调用 auth_login'));

    const handler = (server as any)._registeredTools['message_get_history'].handler;
    const result = await handler({ chat_id: 'oc_test' });
    expect(result.content[0].text).toContain('未登录');
  });
});
