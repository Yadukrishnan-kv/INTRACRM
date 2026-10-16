import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../auth/session';
import { ApiError, request } from './client';

const session = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh-token-value',
  sessionId: 's1',
  tenantId: 't1',
  user: { id: 'u1', fullName: 'Asha', email: 'a@x.in' },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('request', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    sessionStore.set(session);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    sessionStore.set(null);
  });

  it('unwraps the envelope and sends tenant, device and auth headers', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { data: [{ id: 'l1' }], meta: { page: { limit: 50, hasMore: true, nextCursor: 'c', prevCursor: null } } }),
    );
    const result = await request<Array<{ id: string }>>('/leads', { query: { q: 'x', status: undefined } });

    expect(result.data).toEqual([{ id: 'l1' }]);
    expect(result.page?.nextCursor).toBe('c');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/leads?q=x');
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer old-access');
    expect(headers['X-Tenant-Id']).toBe('t1');
    expect(headers['X-Device-Id']).toMatch(/^web-/);
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', title: 'Unauthorized' }))
      .mockResolvedValueOnce(
        json(200, { data: { accessToken: 'new-access', refreshToken: 'new-refresh', tenantId: 't1' } }),
      )
      .mockResolvedValueOnce(json(200, { data: { ok: true } }));

    const result = await request<{ ok: boolean }>('/me');

    expect(result.data.ok).toBe(true);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/refresh');
    const retryHeaders = fetchMock.mock.calls[2]![1]!.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-access');
    expect(sessionStore.get()?.refreshToken).toBe('new-refresh');
    expect(sessionStore.get()?.user.fullName).toBe('Asha');
  });

  it('signs out without refreshing on DEVICE_MISMATCH', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: 'DEVICE_MISMATCH', title: 'Unauthorized', detail: 'Device changed' }));

    await expect(request('/me')).rejects.toMatchObject({ code: 'DEVICE_MISMATCH' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStore.get()).toBeNull();
  });

  it('signs out when the refresh itself fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', title: 'Unauthorized' }))
      .mockResolvedValueOnce(json(401, { code: 'REFRESH_REUSE', title: 'Unauthorized' }));

    await expect(request('/me')).rejects.toBeInstanceOf(ApiError);
    expect(sessionStore.get()).toBeNull();
  });

  it('adds an idempotency key to unsafe methods and surfaces problem details', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { code: 'VALIDATION_ERROR', title: 'Bad Request', detail: 'Title is required', errors: [{ field: 'title' }] }),
    );

    const error = await request('/leads', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Title is required');
    expect((error as ApiError).errors[0]?.field).toBe('title');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTruthy();
  });
});
