import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { HttpHeaders } from '../http/http-headers';
import { requestContextStorage } from '../http/request-context';
import { DEVICE_A, actor, jwtConfig } from '../../testing/fixtures';
import { httpContext } from '../../testing/http-context';
import { createPrismaMock } from '../../testing/prisma-mock';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthGuard } from './auth.guard';
import { MembershipGuard } from './membership.guard';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from './require-permissions.decorator';

function config() {
  return {
    get: jest.fn().mockReturnValue(jwtConfig()),
  };
}

describe('AuthGuard', () => {
  it('allows public handlers only', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    expect(new AuthGuard(reflector as unknown as Reflector).canActivate(httpContext({}))).toBe(
      true,
    );
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(new AuthGuard(reflector as unknown as Reflector).canActivate(httpContext({}))).toBe(
      false,
    );
  });
});

describe('JwtAuthGuard', () => {
  const prisma = createPrismaMock();
  const jwt = { verifyAsync: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new JwtAuthGuard(
    reflector as unknown as Reflector,
    jwt as unknown as JwtService,
    prisma as never,
    config() as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('skips public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true);
  });

  it('rejects a missing bearer token', async () => {
    await expect(guard.canActivate(httpContext({}))).rejects.toMatchObject({
      code: ErrorCodes.UNAUTHORIZED,
    });
  });

  it('rejects an invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer not-a-token' } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.UNAUTHORIZED });
  });

  it('rejects a non-access token payload', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'refresh', sub: 'u', sid: 's' });
    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer tok' } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.UNAUTHORIZED });
  });

  it('rejects a missing session', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's' });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer tok' } }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.SESSION_EXPIRED });
  });

  it('rejects an expired session clock', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's' });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() - 1000),
      lastSeenAt: new Date(),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'active' },
    });
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: DEVICE_A },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.SESSION_EXPIRED });
  });

  it('expires an idle session', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's' });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'active' },
    });
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: DEVICE_A },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.SESSION_EXPIRED });
    expect(prisma.authSession.update).toHaveBeenCalled();
  });

  it('rejects a disabled account', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's' });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'disabled' },
    });
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: DEVICE_A },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
  });

  it('rejects a locked account', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's' });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'locked' },
    });
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: DEVICE_A },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.ACCOUNT_LOCKED });
  });

  it('rejects a device mismatch', async () => {
    jwt.verifyAsync.mockResolvedValue({ typ: 'access', sub: 'u', sid: 's', did: DEVICE_A });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'active' },
    });
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: 'other-device' },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.DEVICE_MISMATCH });
  });

  it('attaches the user on a valid session', async () => {
    jwt.verifyAsync.mockResolvedValue({
      typ: 'access',
      sub: 'u',
      sid: 's',
      tid: actor().tenantId,
      did: DEVICE_A,
    });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(Date.now() - 120_000),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'active' },
    });
    const ctx = httpContext({
      headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: DEVICE_A },
    });
    await requestContextStorage.run(
      { requestId: 'req', path: '/', method: 'GET' },
      async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
      },
    );
    const req = ctx.switchToHttp().getRequest<{ user?: { userId: string } }>();
    expect(req.user?.userId).toBe('u');
  });
});

describe('MembershipGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const rbac = { resolve: jest.fn() };
  const guard = new MembershipGuard(reflector as unknown as Reflector, rbac as never);

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('skips public, skip-tenant, and docs paths', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true);
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(httpContext({ path: '/api/docs' }))).resolves.toBe(true);
  });

  it('requires a tenant for authenticated users', async () => {
    await expect(
      guard.canActivate(httpContext({ user: { userId: 'u', sessionId: 's' } })),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_REQUIRED });
  });

  it('rejects a user with no membership', async () => {
    rbac.resolve.mockResolvedValue(null);
    await expect(
      guard.canActivate(httpContext({ user: actor() })),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_MISMATCH });
  });

  it('hydrates roles and permissions', async () => {
    rbac.resolve.mockResolvedValue({
      membershipId: 'm1',
      roles: ['tenant.founder'],
      permissions: ['lead:read'],
    });
    const ctx = httpContext({ user: actor() });
    await requestContextStorage.run(
      { requestId: 'req', path: '/', method: 'GET', tenantId: actor().tenantId },
      async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
      },
    );
    const req = ctx.switchToHttp().getRequest<{ user?: { permissions?: string[] } }>();
    expect(req.user?.permissions).toEqual(['lead:read']);
  });
});

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  it('allows public and unrestricted handlers', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    expect(guard.canActivate(httpContext({}))).toBe(true);
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(httpContext({}))).toBe(true);
  });

  it('enforces required and any-of permissions', () => {
    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === PERMISSIONS_KEY) {
        return ['lead:read'];
      }
      return undefined;
    });
    expect(() => guard.canActivate(httpContext({ user: actor({ permissions: [] }) }))).toThrow(
      AppException,
    );
    expect(
      guard.canActivate(httpContext({ user: actor({ permissions: ['lead:read'] }) })),
    ).toBe(true);

    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === ANY_PERMISSIONS_KEY) {
        return ['lead:export', 'lead:read'];
      }
      return undefined;
    });
    expect(
      guard.canActivate(httpContext({ user: actor({ permissions: ['lead:read'] }) })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(httpContext({ user: actor({ permissions: ['audit:read'] }) })),
    ).toThrow(AppException);
  });
});
