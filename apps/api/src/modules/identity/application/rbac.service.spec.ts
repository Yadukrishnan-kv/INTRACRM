import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor, TENANT_A } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { RbacService } from './rbac.service';
import { SYSTEM_ROLE } from '../domain/system-roles';

function redisMock() {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
      return keys.length;
    }),
    scan: jest.fn(async () => ['0', []]),
    store,
  };
}

describe('RbacService', () => {
  const prisma = createPrismaMock();
  const redis = redisMock();
  const service = new RbacService(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
    redis.store.clear();
    redis.scan.mockResolvedValue(['0', []]);
  });

  it('returns cached access and hydrates from memberships', async () => {
    const cached = { membershipId: 'm1', roles: ['tenant.admin'], permissions: ['lead:read'] };
    redis.store.set(`rbac:perm:${TENANT_A}:u1`, JSON.stringify(cached));
    await expect(service.resolve('u1', TENANT_A)).resolves.toEqual(cached);

    redis.store.clear();
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      id: 'm1',
      roles: [
        {
          role: {
            code: SYSTEM_ROLE.admin,
            deletedAt: null,
            permissions: [{ permission: { code: 'lead:read' } }],
          },
        },
      ],
    });
    await expect(service.resolve('u1', TENANT_A)).resolves.toMatchObject({
      membershipId: 'm1',
      roles: [SYSTEM_ROLE.admin],
    });
  });

  it('returns null when the user has no membership', async () => {
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.resolve('u1', TENANT_A)).resolves.toBeNull();
  });

  it('ignores corrupt cache JSON', async () => {
    redis.store.set(`rbac:perm:${TENANT_A}:u1`, '{not-json');
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.resolve('u1', TENANT_A)).resolves.toBeNull();
  });

  it('creates a tenant role and rejects duplicates and system edits', async () => {
    (prisma.role.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'dup' });
    await expect(
      service.createRole(actor(), { code: 'custom.role', name: 'Custom' }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });

    (prisma.role.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.permission.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.role.create as jest.Mock).mockResolvedValue({
      id: 'r1',
      code: 'custom.role',
      name: 'Custom',
      description: null,
      isSystem: false,
      isDefault: false,
      tenantId: TENANT_A,
      permissions: [],
    });
    await expect(
      service.createRole(actor(), { code: 'custom.role', name: 'Custom' }),
    ).resolves.toMatchObject({ code: 'custom.role' });

    (prisma.role.findFirst as jest.Mock).mockResolvedValue({
      id: 'sys',
      isSystem: true,
      code: SYSTEM_ROLE.founder,
      name: 'Founder',
      description: null,
      isDefault: true,
      tenantId: null,
      permissions: [],
    });
    await expect(
      service.updateRole(actor(), 'sys', { name: 'Nope' }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    await expect(service.deleteRole(actor(), 'sys')).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
    });
  });

  it('blocks founder assignment from a non-founder', async () => {
    (prisma.role.findFirst as jest.Mock).mockResolvedValue({
      id: 'm1',
      userId: 'u2',
      tenantId: TENANT_A,
      deletedAt: null,
      user: { id: 'u2', fullName: 'X', email: 'x@y.z' },
      roles: [{ role: { id: 'r', code: SYSTEM_ROLE.salesStaff, name: 'Staff', deletedAt: null } }],
    });
    (prisma.role.findMany as jest.Mock).mockResolvedValue([
      { id: 'founder', code: SYSTEM_ROLE.founder },
    ]);
    // loadAssignableRoles uses prisma.role.findMany; requireMembership uses membership.findFirst
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      id: 'm1',
      userId: 'u2',
      tenantId: TENANT_A,
      deletedAt: null,
      user: { id: 'u2', fullName: 'X', email: 'x@y.z' },
      roles: [{ role: { id: 'r', code: SYSTEM_ROLE.salesStaff, name: 'Staff', deletedAt: null } }],
    });
    await expect(
      service.assignRoles(actor({ roles: [SYSTEM_ROLE.admin] }), 'm1', {
        roleIds: ['founder'],
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
  });

  it('requires a tenant on mutating calls', async () => {
    await expect(
      service.createRole({ userId: actor().userId, sessionId: actor().sessionId }, { code: 'x', name: 'X' }),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_REQUIRED });
  });

  it('scans redis keys when invalidating a tenant', async () => {
    redis.scan
      .mockResolvedValueOnce(['1', ['rbac:perm:t:a']])
      .mockResolvedValueOnce(['0', []]);
    await service.invalidateTenant(TENANT_A);
    expect(redis.del).toHaveBeenCalled();
  });
});
