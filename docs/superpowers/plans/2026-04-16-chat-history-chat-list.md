# Chat History and Chat List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `chat_list` and `message_get_history` tools to enable reading user's chat conversations and message history using user_access_token.

**Architecture:** Extend existing chat.ts with two new tools that use getUserToken for authentication. Update registerChatTools signature to accept ctx and db parameters. Follow TDD approach with tests before implementation.

**Tech Stack:** TypeScript, Zod, MCP SDK, Axios, Vitest

---

## File Structure

**Modified Files:**
- `src/mcp/tools/chat.ts` — Add chat_list and message_get_history tools
- `src/mcp/index.ts` — Update registerChatTools call to pass ctx and db
- `tests/tools/chat.test.ts` — Add tests for new tools
- `README.md` — Update tool count and documentation

**No new files needed** — all changes integrate into existing structure.

---

## Task 1: Update registerChatTools Signature

**Files:**
- Modify: `src/mcp/tools/chat.ts:240` (function signature)
- Modify: `src/mcp/index.ts:18` (function call)

- [ ] **Step 1: Write failing test for signature change**

```typescript
// tests/tools/chat.test.ts - add at top after imports
import type { Db } from '../../src/db/index.js';
import type { SessionContext } from '../../src/feishu/types.js';

// Update beforeEach block
beforeEach(() => {
  vi.clearAllMocks();
  server = new McpServer({ name: 'test', version: '1.0.0' });
  const mockDb = {} as Db;
  const mockCtx: SessionContext = { mcpSessionId: 'test-session', openId: 'test-open-id' };
  registerChatTools(server, mockCtx, mockDb);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/chat.test.ts`
Expected: TypeScript error "Expected 3 arguments, but got 1"

- [ ] **Step 3: Update registerChatTools signature**

```typescript
// src/mcp/tools/chat.ts:240
export function registerChatTools(server: McpServer, ctx: SessionContext, db: Db) {
  // existing getBotClient function stays unchanged
  async function getBotClient() {
    const token = await getAppAccessToken();
    return createFeishuClient(token);
  }
  
  // existing tools stay unchanged...
```

Add imports at top:

```typescript
// src/mcp/tools/chat.ts - add to imports section
import type { Db } from '../../db/index.js';
import type { SessionContext } from '../../feishu/types.js';
import { getUserToken, AuthError } from '../../feishu/userAuth.js';
```

- [ ] **Step 4: Update registerChatTools call in index.ts**

```typescript
// src/mcp/index.ts:18
registerChatTools(server, ctx, db);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/tools/chat.test.ts`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/chat.ts src/mcp/index.ts tests/tools/chat.test.ts
git commit -m "refactor: update registerChatTools to accept ctx and db"
```

---

## Task 2: Implement chat_list Tool

**Files:**
- Modify: `src/mcp/tools/chat.ts` (add tool after message_send_group)
- Modify: `tests/tools/chat.test.ts` (add test)

- [ ] **Step 1: Write failing test for chat_list**

```typescript
// tests/tools/chat.test.ts - add after existing tests
it('chat_list returns user chats with pagination', async () => {
  const mockGet = vi.fn().mockResolvedValue({
    code: 0,
    data: {
      items: [
        { chat_id: 'oc_123', name: 'Team Chat', chat_mode: 'group' },
        { chat_id: 'oc_456', name: 'Direct Message', chat_mode: 'p2p' }
      ],
      has_more: false,
      page_token: ''
    },
  });
  vi.mocked(axios.create).mockReturnValue({
    get: mockGet,
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  } as any);

  const handler = (server as any)._registeredTools['chat_list'].handler;
  const result = await handler({ count: 20 });
  expect(result.content[0].text).toContain('oc_123');
  expect(result.content[0].text).toContain('Team Chat');
  expect(mockGet).toHaveBeenCalledWith('/im/v1/chats', expect.objectContaining({
    params: expect.objectContaining({ page_size: 20 })
  }));
});
```

Mock getUserToken:

```typescript
// tests/tools/chat.test.ts - add to mocks section at top
vi.mock('../../src/feishu/userAuth.js', () => ({
  getUserToken: vi.fn().mockResolvedValue('user_tok_mock'),
  AuthError: class AuthError extends Error {},
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/chat.test.ts -t "chat_list"`
Expected: FAIL with "chat_list is not defined"

- [ ] **Step 3: Implement chat_list tool**

```typescript
// src/mcp/tools/chat.ts - add after message_send_group tool, before closing brace
server.tool(
  'chat_list',
  '列出当前登录用户可访问的会话（群聊和单聊）',
  {
    count: z.number().min(1).max(100).optional().default(20).describe('返回会话数量，默认 20'),
    sort_type: z.enum(['ByCreateTimeAsc', 'ByActiveTimeDesc']).optional().default('ByActiveTimeDesc').describe('排序方式'),
  },
  async ({ count, sort_type }: { count?: number; sort_type?: 'ByCreateTimeAsc' | 'ByActiveTimeDesc' }) => {
    logToolCall('chat_list', { count, sort_type });
    try {
      const token = await getUserToken(db, ctx);
      const client = createFeishuClient(token);
      
      const pageSize = count ?? 20;
      const chats: any[] = [];
      let pageToken = '';
      
      while (chats.length < pageSize) {
        const params: Record<string, any> = {
          page_size: Math.min(pageSize - chats.length, 100),
          sort_type: sort_type ?? 'ByActiveTimeDesc',
        };
        if (pageToken) params.page_token = pageToken;
        
        const res = await client.get('/im/v1/chats', { params });
        const items = res.data?.items ?? [];
        chats.push(...items);
        
        if (!res.data?.has_more) break;
        pageToken = res.data?.page_token ?? '';
        if (!pageToken) break;
      }
      
      if (chats.length === 0) {
        return { content: [{ type: 'text' as const, text: '暂无可访问会话' }] };
      }
      
      const lines = chats.slice(0, pageSize).map((c: any) => {
        const chatType = c.chat_mode === 'p2p' ? '单聊' : '群聊';
        return `- ${c.name || '(无名称)'}  chat_id: ${c.chat_id}  类型: ${chatType}`;
      });
      
      return {
        content: [{ type: 'text' as const, text: `会话列表（共 ${lines.length} 个）：\n${lines.join('\n')}` }],
      };
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
      return { content: [{ type: 'text' as const, text: msg }] };
    }
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/chat.test.ts -t "chat_list"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/chat.ts tests/tools/chat.test.ts
git commit -m "feat: add chat_list tool for listing user conversations"
```

---

## Task 3: Implement message_get_history Tool

**Files:**
- Modify: `src/mcp/tools/chat.ts` (add tool after chat_list)
- Modify: `tests/tools/chat.test.ts` (add test)

- [ ] **Step 1: Write failing test for message_get_history**

```typescript
// tests/tools/chat.test.ts - add after chat_list test
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
          sender: { id: 'ou_123', sender_type: 'user' }
        },
        {
          message_id: 'om_002',
          create_time: '1713254500',
          msg_type: 'text',
          body: { content: '{"text":"World"}' },
          sender: { id: 'ou_456', sender_type: 'user' }
        }
      ],
      has_more: false
    },
  });
  vi.mocked(axios.create).mockReturnValue({
    get: mockGet,
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  } as any);

  const handler = (server as any)._registeredTools['message_get_history'].handler;
  const result = await handler({ chat_id: 'oc_test123', count: 20 });
  expect(result.content[0].text).toContain('om_001');
  expect(result.content[0].text).toContain('Hello');
  expect(mockGet).toHaveBeenCalledWith('/im/v1/messages', expect.objectContaining({
    params: expect.objectContaining({
      container_id_type: 'chat',
      container_id: 'oc_test123'
    })
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/chat.test.ts -t "message_get_history"`
Expected: FAIL with "message_get_history is not defined"

- [ ] **Step 3: Implement message_get_history tool**

```typescript
// src/mcp/tools/chat.ts - add after chat_list tool
server.tool(
  'message_get_history',
  '按 chat_id 获取会话历史消息',
  {
    chat_id: z.string().describe('会话 ID'),
    count: z.number().min(1).max(100).optional().default(20).describe('返回消息数量，默认 20'),
    sort_type: z.enum(['ByCreateTimeAsc', 'ByCreateTimeDesc']).optional().default('ByCreateTimeAsc').describe('排序方式'),
    start_time: z.number().optional().describe('起始时间（秒级时间戳）'),
    end_time: z.number().optional().describe('结束时间（秒级时间戳）'),
  },
  async ({ chat_id, count, sort_type, start_time, end_time }: {
    chat_id: string;
    count?: number;
    sort_type?: 'ByCreateTimeAsc' | 'ByCreateTimeDesc';
    start_time?: number;
    end_time?: number;
  }) => {
    logToolCall('message_get_history', { chat_id, count, sort_type, start_time, end_time });
    try {
      const token = await getUserToken(db, ctx);
      const client = createFeishuClient(token);
      
      const pageSize = count ?? 20;
      const messages: any[] = [];
      let pageToken = '';
      
      while (messages.length < pageSize) {
        const params: Record<string, any> = {
          container_id_type: 'chat',
          container_id: chat_id,
          page_size: Math.min(pageSize - messages.length, 100),
          sort_type: sort_type ?? 'ByCreateTimeAsc',
        };
        if (start_time) params.start_time = String(start_time);
        if (end_time) params.end_time = String(end_time);
        if (pageToken) params.page_token = pageToken;
        
        const res = await client.get('/im/v1/messages', { params });
        const items = res.data?.items ?? [];
        messages.push(...items);
        
        if (!res.data?.has_more) break;
        pageToken = res.data?.page_token ?? '';
        if (!pageToken) break;
      }
      
      if (messages.length === 0) {
        return { content: [{ type: 'text' as const, text: '该会话暂无历史消息' }] };
      }
      
      const lines = messages.slice(0, pageSize).map((m: any) => {
        const time = new Date(parseInt(m.create_time) * 1000).toLocaleString('zh-CN');
        const sender = m.sender?.id ?? '未知';
        const msgType = m.msg_type ?? 'unknown';
        
        let textSummary = '';
        if (msgType === 'text' && m.body?.content) {
          try {
            const parsed = JSON.parse(m.body.content);
            textSummary = parsed.text ?? '';
          } catch {
            textSummary = String(m.body.content).slice(0, 50);
          }
        } else {
          textSummary = `[${msgType}]`;
        }
        
        return `[${time}] ${sender} (${msgType}): ${textSummary}\n  message_id: ${m.message_id}`;
      });
      
      return {
        content: [{ type: 'text' as const, text: `历史消息（共 ${lines.length} 条）：\n\n${lines.join('\n\n')}` }],
      };
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : `飞书 API 错误：${String(err)}`;
      return { content: [{ type: 'text' as const, text: msg }] };
    }
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/chat.test.ts -t "message_get_history"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/chat.ts tests/tools/chat.test.ts
git commit -m "feat: add message_get_history tool for reading chat history"
```

---

## Task 4: Add Auth Error Test

**Files:**
- Modify: `tests/tools/chat.test.ts` (add auth error test)

- [ ] **Step 1: Write test for unauthenticated access**

```typescript
// tests/tools/chat.test.ts - add after message_get_history test
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- tests/tools/chat.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/tools/chat.test.ts
git commit -m "test: add auth error tests for chat reading tools"
```

---

## Task 5: Update README Documentation

**Files:**
- Modify: `README.md` (update tool count and add tool descriptions)

- [ ] **Step 1: Update tool count**

```markdown
<!-- README.md:110 - change from 14 to 16 -->
## 可用工具（共 16 个）
```

- [ ] **Step 2: Add new tools section**

```markdown
<!-- README.md - add after line 144 (after message_send_group) -->

### 聊天读取（用户身份）

| 工具 | 说明 |
|------|------|
| `chat_list` | 列出当前登录用户可访问的会话（群聊和单聊），返回 chat_id、名称、类型 |
| `message_get_history` | 按 chat_id 获取会话历史消息，支持数量限制和时间范围过滤 |
```

- [ ] **Step 3: Update permissions section if needed**

```markdown
<!-- README.md:146 - verify permissions include message reading -->
在飞书开放平台控制台需开通以下权限：

- `docx:document` — 查看、编辑文档
- `drive:drive:readonly` — 搜索云盘文件
- `wiki:wiki:readonly` — 查看知识库
- `wiki:wiki` — 在知识库中创建文档（`wiki_create_document` 工具需要）
- `im:message` — 读取消息历史（`chat_list` 和 `message_get_history` 工具需要）
- `im:message:send_as_bot` — 机器人发消息
- `im:chat` — 查看群列表（按群名发消息）
```

- [ ] **Step 4: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with chat_list and message_get_history tools"
```

---

## Task 6: Manual Verification

**Files:**
- None (manual testing)

- [ ] **Step 1: Build and start server**

```bash
npm run build
npm start
```

Expected: Server starts on port 5201

- [ ] **Step 2: Test chat_list in Claude Code**

In Claude Code, call:
```
chat_list
```

Expected: Returns list of user's chats with chat_id values

- [ ] **Step 3: Test message_get_history**

Using a chat_id from previous step:
```
message_get_history with chat_id: <actual_chat_id>
```

Expected: Returns message history with timestamps and content

- [ ] **Step 4: Test unauthenticated scenario**

Clear auth state and call chat_list without logging in.

Expected: Returns auth error message

- [ ] **Step 5: Document verification results**

Create verification note:

```bash
echo "Manual verification completed on $(date)" > docs/superpowers/verification-2026-04-16.txt
git add docs/superpowers/verification-2026-04-16.txt
git commit -m "docs: add manual verification results"
```

---

## Summary

This plan implements two new chat reading tools following TDD principles:

1. **chat_list** - Lists user's accessible conversations
2. **message_get_history** - Retrieves message history by chat_id

Both tools use user_access_token for authentication and follow existing error handling patterns. The implementation maintains backward compatibility with existing chat tools while extending functionality for read operations.

**Total commits:** 6
**Estimated time:** 30-40 minutes
