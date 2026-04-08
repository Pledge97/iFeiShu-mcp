import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('appAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('fetches and caches app_access_token', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { code: 0, app_access_token: 'tok_abc', expire: 7200 },
    });

    const { getAppAccessToken } = await import('../src/feishu/appAuth.js');
    const token1 = await getAppAccessToken();
    const token2 = await getAppAccessToken();

    expect(token1).toBe('tok_abc');
    expect(token2).toBe('tok_abc');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when expired', async () => {
    mockedAxios.post = vi.fn()
      .mockResolvedValueOnce({ data: { code: 0, app_access_token: 'tok_old', expire: 0 } })
      .mockResolvedValueOnce({ data: { code: 0, app_access_token: 'tok_new', expire: 7200 } });

    const { getAppAccessToken } = await import('../src/feishu/appAuth.js');
    const token1 = await getAppAccessToken();
    const token2 = await getAppAccessToken();

    expect(token1).toBe('tok_old');
    expect(token2).toBe('tok_new');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
