import { PermissionsGuard } from '../../src/common/auth/permissions.guard';
import { TenantGuard } from '../../src/common/tenancy/tenant.guard';
import { JwtAuthGuard } from '../../src/common/auth/jwt-auth.guard';
import { ErrorCodes } from '../../src/common/exceptions/error-codes';
import { actor, DEVICE_A, TENANT_A, TENANT_B } from '../../src/testing/fixtures';
import { httpContext } from '../../src/testing/http-context';
import { createPrismaMock } from '../../src/testing/prisma-mock';
import { jwtConfig } from '../../src/testing/fixtures';
import { HttpHeaders } from '../../src/common/http/http-headers';
import { verifyHmacSha256 } from '../../src/modules/billing/domain/billing';
import { createHmac } from 'crypto';
import { LeadsService } from '../../src/modules/crm-leads/application/leads.service';
import { Reflector } from '@nestjs/core';

describe('security: tenant isolation', () => {
  it('does not load a lead from another tenant', async () => {
    const prisma = createPrismaMock();
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new LeadsService(
      prisma as never,
      { ensureDefaults: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.get(actor({ tenantId: TENANT_A }), 'lead-b')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, id: 'lead-b' }),
      }),
    );
    await expect(service.get(actor({ tenantId: TENANT_B }), 'lead-b')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });
});

describe('security: authz matrix', () => {
  it('denies lead:delete when the membership only has lead:read', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === 'requiredPermissions' ? ['lead:delete'] : undefined,
      ),
    };
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate(httpContext({ user: actor({ permissions: ['lead:read'] }) })),
    ).toThrow();
  });
});

describe('security: device binding', () => {
  it('rejects a session bound to another device', async () => {
    const prisma = createPrismaMock();
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ typ: 'access', sub: 'u', sid: 's', did: DEVICE_A }) };
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      deviceId: DEVICE_A,
      user: { email: 'a@b.c', deletedAt: null, status: 'active' },
    });
    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      jwt as never,
      prisma as never,
      { get: () => jwtConfig() } as never,
    );
    await expect(
      guard.canActivate(
        httpContext({
          headers: { authorization: 'Bearer tok', [HttpHeaders.deviceId]: 'other-device' },
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.DEVICE_MISMATCH });
  });
});

describe('security: billing webhook HMAC', () => {
  it('accepts a matching sha256 signature and rejects a truncated one', () => {
    const body = '{"event":"customer.upserted"}';
    const secret = 'webhook-secret';
    const good = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, `sha256=${good}`)).toBe(true);
    expect(verifyHmacSha256(body, secret, 'sha256=ab')).toBe(false);
    expect(verifyHmacSha256(body, secret, undefined)).toBe(false);
  });
});

describe('security: tenant header UUID', () => {
  it('rejects a non-UUID tenant id', () => {
    const guard = new TenantGuard({
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector);
    expect(() =>
      guard.canActivate(httpContext({ headers: { [HttpHeaders.tenantId]: 'tenant-1' } })),
    ).toThrow();
  });
});

describe('security: missing bearer token', () => {
  it('rejects requests without an access token', async () => {
    const prisma = createPrismaMock();
    const jwt = { verifyAsync: jest.fn() };
    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      jwt as never,
      prisma as never,
      { get: () => jwtConfig() } as never,
    );
    await expect(guard.canActivate(httpContext({ headers: {} }))).rejects.toMatchObject({
      code: ErrorCodes.UNAUTHORIZED,
    });
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});

describe('security: permission allow', () => {
  it('allows lead:read when the membership has that permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === 'requiredPermissions' ? ['lead:read'] : undefined,
      ),
    };
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(httpContext({ user: actor({ permissions: ['lead:read'] }) }))).toBe(
      true,
    );
  });
});
