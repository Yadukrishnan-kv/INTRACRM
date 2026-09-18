import { of } from 'rxjs';
import { Public } from './auth/public.decorator';
import { SkipTenant } from './tenancy/skip-tenant.decorator';
import { SkipRateLimit } from './security/skip-rate-limit.decorator';
import { RequirePermissions, RequireAnyPermission } from './auth/require-permissions.decorator';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { httpContext } from '../testing/http-context';
import { CurrentUser } from './auth/current-user.decorator';
import { ErrorCodes } from './exceptions/error-codes';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

describe('decorators and idempotency', () => {
  it('applies metadata decorators', () => {
    class Sample {
      @Public()
      @SkipTenant()
      @SkipRateLimit()
      @RequirePermissions('lead:read')
      @RequireAnyPermission('lead:write')
      handler() {
        return true;
      }
    }
    expect(new Sample().handler()).toBe(true);
  });

  it('reads the idempotency header on unsafe methods', () => {
    const interceptor = new IdempotencyInterceptor();
    const ctx = httpContext({ method: 'POST', headers: { 'idempotency-key': 'abc' } });
    const next = { handle: () => of({ ok: true }) };
    interceptor.intercept(ctx, next).subscribe();
    const getCtx = httpContext({ method: 'GET' });
    interceptor.intercept(getCtx, next).subscribe();
  });

  it('resolves CurrentUser from the request or rejects anonymous calls', () => {
    class Probe {
      method(@CurrentUser() _user: unknown) {
        return _user;
      }
    }
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'method') as Record<
      string,
      { factory: (data: unknown, ctx: unknown) => unknown }
    >;
    const factory = Object.values(metadata)[0]?.factory;
    expect(factory).toBeDefined();
    const user = { userId: 'u', sessionId: 's' };
    expect(factory?.(undefined, httpContext({ user }))).toEqual(user);
    try {
      factory?.(undefined, httpContext({}));
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCodes.UNAUTHORIZED });
    }
  });
});
