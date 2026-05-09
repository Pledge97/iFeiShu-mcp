import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('stdio-safe logging', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  async function importWithMode(mode: 'http' | 'stdio') {
    vi.doMock('../src/config.js', () => ({
      config: {
        feishu: { baseUrl: 'https://test.example.com' },
        server: { mode },
      },
    }));

    const [{ logToolCall }, { createFeishuClient }] = await Promise.all([
      import('../src/mcp/logger.js'),
      import('../src/feishu/client.js'),
    ]);

    return { logToolCall, createFeishuClient };
  }

  it('writes tool call diagnostics to stdout in HTTP mode', async () => {
    const { logToolCall } = await importWithMode('http');

    logToolCall('auth_status', { openId: null });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('tool=auth_status'));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses tool call diagnostics in stdio mode', async () => {
    const { logToolCall } = await importWithMode('stdio');

    logToolCall('auth_status', { openId: null });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes API response diagnostics to stdout in HTTP mode', async () => {
    const { createFeishuClient } = await importWithMode('http');
    let onFulfilled: ((response: any) => any) | undefined;
    vi.mocked(axios.create).mockReturnValue({
      interceptors: {
        response: {
          use: vi.fn((fulfilled) => {
            onFulfilled = fulfilled;
          }),
        },
      },
    } as any);

    createFeishuClient('token');
    const result = onFulfilled?.({
      config: { method: 'get', url: '/auth/v3/app_access_token/internal' },
      data: { code: 0 },
    });

    expect(result).toEqual({ code: 0 });
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API Response] GET /auth/v3/app_access_token/internal'),
      JSON.stringify({ code: 0 }),
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses API response diagnostics in stdio mode', async () => {
    const { createFeishuClient } = await importWithMode('stdio');
    let onFulfilled: ((response: any) => any) | undefined;
    vi.mocked(axios.create).mockReturnValue({
      interceptors: {
        response: {
          use: vi.fn((fulfilled) => {
            onFulfilled = fulfilled;
          }),
        },
      },
    } as any);

    createFeishuClient('token');
    const result = onFulfilled?.({
      config: { method: 'get', url: '/auth/v3/app_access_token/internal' },
      data: { code: 0 },
    });

    expect(result).toEqual({ code: 0 });
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
