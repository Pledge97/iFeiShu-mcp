import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChatTools } from '../../src/mcp/tools/chat.js';

vi.mock('axios');
vi.mock('../../src/feishu/appAuth.js', () => ({
  getAppAccessToken: vi.fn().mockResolvedValue('app_tok_mock'),
}));

describe('chat tools', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '1.0.0' });
    registerChatTools(server);
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
});
