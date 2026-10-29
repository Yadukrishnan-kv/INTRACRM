import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor, MEMBERSHIP_A, TENANT_A } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { RbacService } from './rbac.service';
import { SessionRevocationService } from './session-revocation.service';
import { SYSTEM_ROLE } from '../domain/system-roles';
import { PasswordHasher } from '../infrastructure/password.hasher';

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
  const service = new RbacService(
    prisma as never,
    redis as never,
    new SessionRevocationService(prisma as never),
    new PasswordHasher(),
  );

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

  function membershipRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'm-staff',
      userId: 'u-staff',
      tenantId: TENANT_A,
      status: 'active',
      deletedAt: null,
      designation: null,
      employeeCode: null,
      user: { id: 'u-staff', fullName: 'Staff', email: 's@x.y' },
      roles: [{ role: { id: 'r-staff', code: SYSTEM_ROLE.salesStaff, name: 'Staff', deletedAt: null } }],
      ...overrides,
    };
  }

  it('revokes the member tenant sessions, refresh tokens and push tokens on suspend', async () => {
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(membershipRow());
    (prisma.membership.update as jest.Mock).mockResolvedValue(membershipRow({ status: 'suspended' }));
    (prisma.authSession.findMany as jest.Mock).mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);
    await expect(
      service.updateMembership(actor(), 'm-staff', { status: 'suspended' }),
    ).resolves.toMatchObject({ status: 'suspended' });
    expect(prisma.authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-staff', tenantId: TENANT_A, status: 'active' },
      }),
    );
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['sess-1', 'sess-2'] }, status: 'active' },
        data: expect.objectContaining({ status: 'revoked' }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: { in: ['sess-1', 'sess-2'] }, revokedAt: null } }),
    );
    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-staff', tenantId: TENANT_A, revokedAt: null } }),
    );
    expect(redis.del).toHaveBeenCalledWith(`rbac:perm:${TENANT_A}:u-staff`);
  });

  it('does not revoke sessions when only the designation changes or on reactivation', async () => {
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(membershipRow({ status: 'suspended' }));
    (prisma.membership.update as jest.Mock).mockResolvedValue(membershipRow());
    await service.updateMembership(actor(), 'm-staff', { status: 'active' });
    await service.updateMembership(actor(), 'm-staff', { designation: 'AE' });
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.devicePushToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects suspending or ending your own membership', async () => {
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(
      membershipRow({ id: MEMBERSHIP_A, userId: actor().userId }),
    );
    for (const status of ['suspended', 'ended'] as const) {
      await expect(
        service.updateMembership(actor(), MEMBERSHIP_A, { status }),
      ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    }
    expect(prisma.membership.update).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('only lets a founder change a founder status or roles', async () => {
    const founder = membershipRow({
      roles: [{ role: { id: 'r-founder', code: SYSTEM_ROLE.founder, name: 'Founder', deletedAt: null } }],
    });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(founder);
    const admin = actor({ roles: [SYSTEM_ROLE.admin] });
    await expect(
      service.updateMembership(admin, 'm-staff', { status: 'suspended' }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    (prisma.role.findMany as jest.Mock).mockResolvedValue([
      { id: 'r-founder', code: SYSTEM_ROLE.founder },
      { id: 'r-staff', code: SYSTEM_ROLE.salesStaff },
    ]);
    await expect(
      service.assignRoles(admin, 'm-staff', { roleIds: ['r-founder', 'r-staff'] }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    expect(prisma.membership.update).not.toHaveBeenCalled();

    // A founder may suspend another founder while the last-founder guard passes.
    (prisma.membershipRole.count as jest.Mock).mockResolvedValue(1);
    (prisma.membership.update as jest.Mock).mockResolvedValue({ ...founder, status: 'suspended' });
    await expect(
      service.updateMembership(actor(), 'm-staff', { status: 'suspended' }),
    ).resolves.toMatchObject({ status: 'suspended' });

    // ...but never the last one.
    (prisma.membershipRole.count as jest.Mock).mockResolvedValue(0);
    await expect(
      service.updateMembership(actor(), 'm-staff', { status: 'suspended' }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });
  });

  it('rejects removing your own admin-granting roles', async () => {
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(
      membershipRow({
        id: MEMBERSHIP_A,
        userId: actor().userId,
        roles: [{ role: { id: 'r-admin', code: SYSTEM_ROLE.admin, name: 'Admin', deletedAt: null } }],
      }),
    );
    const roleRows = [
      {
        id: 'r-admin',
        code: SYSTEM_ROLE.admin,
        deletedAt: null,
        permissions: [{ permission: { code: 'tenant:manage_users' } }, { permission: { code: 'tenant:manage_roles' } }],
      },
      {
        id: 'r-staff',
        code: SYSTEM_ROLE.salesStaff,
        deletedAt: null,
        permissions: [{ permission: { code: 'lead:read' } }],
      },
    ];
    (prisma.role.findMany as jest.Mock).mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
      roleRows.filter((row) => args.where.id.in.includes(row.id)),
    );
    const admin = actor({ roles: [SYSTEM_ROLE.admin] });
    await expect(
      service.assignRoles(admin, MEMBERSHIP_A, { roleIds: ['r-staff'] }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN });
    expect(prisma.membershipRole.deleteMany).not.toHaveBeenCalled();

    // Adding a role on top of your admin role is fine.
    await expect(
      service.assignRoles(admin, MEMBERSHIP_A, { roleIds: ['r-admin', 'r-staff'] }),
    ).resolves.toBeDefined();
    (prisma.role.findMany as jest.Mock).mockReset();
    (prisma.role.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('refuses to delete a role still assigned to members', async () => {
    (prisma.role.findFirst as jest.Mock).mockResolvedValue({
      id: 'r-custom',
      isSystem: false,
      code: 'custom.x',
      name: 'Custom',
      description: null,
      isDefault: false,
      tenantId: TENANT_A,
      permissions: [],
    });
    (prisma.membershipRole.count as jest.Mock).mockResolvedValue(2);
    const error = await service.deleteRole(actor(), 'r-custom').catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: ErrorCodes.CONFLICT });
    expect((error as { getResponse(): { detail: string } }).getResponse().detail).toContain('2 members');
    expect(prisma.membershipRole.count).toHaveBeenCalledWith({
      where: {
        roleId: 'r-custom',
        membership: { tenantId: TENANT_A, deletedAt: null, status: { not: 'ended' } },
      },
    });
    expect(prisma.role.update).not.toHaveBeenCalled();
    expect(prisma.membershipRole.deleteMany).not.toHaveBeenCalled();

    (prisma.membershipRole.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteRole(actor(), 'r-custom')).resolves.toEqual({ deleted: true });
    expect(prisma.membershipRole.deleteMany).not.toHaveBeenCalled();
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
