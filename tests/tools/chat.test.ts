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

  it('message_send_user resolves email to open_id then sends message', async () => {
    const mockPost = vi.fn()
      .mockResolvedValueOnce({
        data: { code: 0, data: { user_list: [{ email: 'alice@example.com', open_id: 'ou_alice' }] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { message_id: 'msg_001' } },
      });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_user'].handler;
    const result = await handler({ email: 'alice@example.com', message: 'Hello!' });
    expect(result.content[0].text).toContain('msg_001');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('message_send_user returns error when email not found', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      data: { code: 0, data: { user_list: [] } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_user'].handler;
    const result = await handler({ email: 'nobody@example.com', message: 'Hi' });
    expect(result.content[0].text).toContain('未找到');
  });

  it('message_send_group sends message to chat_id', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      data: { code: 0, data: { message_id: 'msg_002' } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_group'].handler;
    const result = await handler({ chat_id: 'oc_abc123', message: 'Team update' });
    expect(result.content[0].text).toContain('msg_002');
  });

  it('chat_create resolves emails and creates group chat', async () => {
    const mockPost = vi.fn()
      .mockResolvedValueOnce({
        data: { code: 0, data: { user_list: [
          { email: 'a@x.com', open_id: 'ou_a' },
          { email: 'b@x.com', open_id: 'ou_b' },
        ] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { chat_id: 'oc_newchat' } },
      });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['chat_create'].handler;
    const result = await handler({ name: 'Project Alpha', emails: ['a@x.com', 'b@x.com'] });
    expect(result.content[0].text).toContain('oc_newchat');
  });
});
