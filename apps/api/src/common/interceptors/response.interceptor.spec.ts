import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { ResponseInterceptor } from './response.interceptor';
import { createResponse, httpContext } from '../../testing/http-context';
import { HttpHeaders } from '../http/http-headers';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps JSON payloads in the success envelope', async () => {
    const ctx = httpContext({ originalUrl: '/api/v1/leads' });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of({ id: '1' }) }),
    );
    expect(result).toMatchObject({
      data: { id: '1' },
      meta: { requestId: 'unknown' },
    });
  });

  it('passes through envelope-shaped bodies with paging', async () => {
    const ctx = httpContext({ originalUrl: '/api/v1/leads' });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, {
        handle: () => of({ data: [], page: { limit: 20, hasMore: false, nextCursor: null, prevCursor: null } }),
      }),
    );
    expect(result).toMatchObject({
      data: [],
      meta: { page: { limit: 20, hasMore: false } },
    });
  });

  it('skips health, docs, warranty portal, exports, and SSE', async () => {
    const interceptorSkip = new ResponseInterceptor();
    const cases = [
      '/api/v1/health/live',
      '/api/docs',
      '/api/v1/public/warranty',
      '/api/v1/public/warranty/view',
      '/api/v1/reports/leads/export',
    ];
    for (const url of cases) {
      const ctx = httpContext({ originalUrl: url });
      const result = await lastValueFrom(
        interceptorSkip.intercept(ctx, { handle: () => of({ raw: true }) }),
      );
      expect(result).toEqual({ raw: true });
    }
    const sse = createResponse();
    sse.setHeader('content-type', 'text/event-stream');
    const ctx = httpContext({ originalUrl: '/api/v1/events', response: sse });
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of('event') }),
    );
    expect(result).toBe('event');
  });
});

describe('IdempotencyInterceptor', () => {
  it('reads the idempotency header on unsafe methods', async () => {
    const interceptor = new IdempotencyInterceptor();
    const ctx = httpContext({
      method: 'POST',
      headers: { [HttpHeaders.idempotencyKey]: 'abc' },
    });
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') }));
    expect(ctx.switchToHttp().getRequest().header(HttpHeaders.idempotencyKey)).toBe('abc');
  });
});
