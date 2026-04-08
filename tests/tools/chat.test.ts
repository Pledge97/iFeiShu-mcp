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
      data: { code: 0, data: { message_id: 'msg_001' } },
    });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['message_send_user'].handler;
    const result = await handler({ account: 'alice', message: 'Hello!' });
    expect(result.content[0].text).toContain('msg_001');
    expect(result.content[0].text).toContain('alice');
    // 直接发邮件，只调用一次 post
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/im/v1/messages?receive_id_type=email',
      expect.objectContaining({ receive_id: 'alice@iflytek.com' })
    );
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

  it('chat_create resolves user_ids via email then creates group chat', async () => {
    const mockPost = vi.fn()
      .mockResolvedValueOnce({
        // batch_get_id 返回 user_id
        data: { code: 0, data: { user_list: [
          { email: 'userA@iflytek.com', user_id: 'uid_a' },
          { email: 'userB@iflytek.com', user_id: 'uid_b' },
        ] } },
      })
      .mockResolvedValueOnce({
        // create chat
        data: { code: 0, data: { chat_id: 'oc_newchat' } },
      });
    vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any);

    const handler = (server as any)._registeredTools['chat_create'].handler;
    const result = await handler({ name: 'Project Alpha', accounts: ['userA', 'userB'] });
    expect(result.content[0].text).toContain('oc_newchat');
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/im/v1/chats',
      expect.objectContaining({ user_id_list: ['uid_a', 'uid_b'], user_id_type: 'user_id' })
    );
  });
});
