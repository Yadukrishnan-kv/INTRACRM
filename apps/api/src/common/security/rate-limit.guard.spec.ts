import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '../exceptions/error-codes';
import { rateLimitConfig } from '../../testing/fixtures';
import { httpContext } from '../../testing/http-context';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiterService } from './rate-limiter.service';
import { AuthSecurityMiddleware } from './auth-security.middleware';
import { createRequest, createResponse } from '../../testing/http-context';

describe('RateLimiterService', () => {
  it('allows hits under the limit and reports retry-after when exceeded', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(11),
      expire: jest.fn(),
      ttl: jest.fn().mockResolvedValue(9),
    };
    const limiter = new RateLimiterService(redis as never);
    await expect(limiter.hit('read:ip:1', 10, 60)).resolves.toMatchObject({
      allowed: true,
      count: 1,
    });
    await expect(limiter.hit('read:ip:1', 10, 60)).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 9,
    });
  });

  it('fails open when Redis throws', async () => {
    const limiter = new RateLimiterService({
      incr: jest.fn().mockRejectedValue(new Error('down')),
    } as never);
    await expect(limiter.hit('x', 1, 1)).resolves.toMatchObject({ allowed: true, count: 0 });
  });
});

describe('RateLimitGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const limiter = { hit: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(rateLimitConfig()) };
  const guard = new RateLimitGuard(
    reflector as unknown as Reflector,
    limiter as unknown as RateLimiterService,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    config.get.mockReturnValue(rateLimitConfig());
  });

  it('skips decorated handlers, disabled limits, and health/auth login', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true);

    reflector.getAllAndOverride.mockReturnValue(false);
    config.get.mockReturnValue(rateLimitConfig({ enabled: false }));
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true);

    config.get.mockReturnValue(rateLimitConfig());
    await expect(
      guard.canActivate(httpContext({ originalUrl: '/api/v1/health/live' })),
    ).resolves.toBe(true);
  });

  it('throws when the limiter rejects a write', async () => {
    limiter.hit.mockResolvedValue({
      allowed: false,
      count: 41,
      limit: 40,
      retryAfterSeconds: 15,
    });
    await expect(
      guard.canActivate(httpContext({ method: 'POST', originalUrl: '/api/v1/leads' })),
    ).rejects.toMatchObject({ code: ErrorCodes.RATE_LIMITED });
  });

  it('uses the user id when present', async () => {
    limiter.hit.mockResolvedValue({ allowed: true, count: 1, limit: 120, retryAfterSeconds: 0 });
    await expect(
      guard.canActivate(
        httpContext({
          originalUrl: '/api/v1/leads',
          user: { userId: 'u1', sessionId: 's' },
        }),
      ),
    ).resolves.toBe(true);
    expect(limiter.hit).toHaveBeenCalledWith('read:user:u1', 120, 60);
  });
});

describe('AuthSecurityMiddleware', () => {
  it('sets cache headers on auth and me routes', () => {
    const middleware = new AuthSecurityMiddleware();
    const response = createResponse();
    middleware.use(createRequest({ originalUrl: '/api/v1/auth/login' }), response, jest.fn());
    expect(response.headers['cache-control']).toContain('no-store');
    const next = jest.fn();
    middleware.use(createRequest({ originalUrl: '/api/v1/leads' }), createResponse(), next);
    expect(next).toHaveBeenCalled();
  });
});
