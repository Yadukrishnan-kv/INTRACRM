import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor, TENANT_A } from '../../../testing/fixtures';
import { createPrismaMock, PrismaMock } from '../../../testing/prisma-mock';
import { TargetsService } from './targets.service';

type MemberStatus = 'active' | 'suspended' | 'ended';

const MEMBERS: Record<string, { status: MemberStatus; deletedAt: Date | null }> = {
  'm-active': { status: 'active', deletedAt: null },
  'm-suspended': { status: 'suspended', deletedAt: null },
  // Ending a membership also soft-deletes it (see RbacService.updateMembership).
  'm-ended': { status: 'ended', deletedAt: new Date('2026-08-01T00:00:00.000Z') },
};

/** Emulates the membership lookup's where clause against the fixture members. */
function membershipLookup(args: {
  where: { id: string; tenantId: string; deletedAt: null; status?: MemberStatus };
}) {
  const member = MEMBERS[args.where.id];
  if (!member || args.where.tenantId !== TENANT_A || member.deletedAt !== null) {
    return Promise.resolve(null);
  }
  if (args.where.status && args.where.status !== member.status) {
    return Promise.resolve(null);
  }
  return Promise.resolve({ id: args.where.id });
}

function existingTarget(scopeId: string) {
  return {
    id: 'tg-1',
    tenantId: TENANT_A,
    version: 1,
    scopeType: 'membership',
    scopeId,
    productId: null,
    metricCode: 'revenue',
    periodType: 'monthly',
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    targetValue: 100_000,
    notes: null,
    deletedAt: null,
  };
}

describe('TargetsService staff scope checks', () => {
  let prisma: PrismaMock;
  let service: TargetsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ timezone: 'Asia/Kolkata' });
    (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({ code: 'revenue' });
    (prisma.membership.findFirst as jest.Mock).mockImplementation(membershipLookup);
    service = new TargetsService(prisma as never);
    // The view hydration after a write is covered elsewhere; only the scope check matters here.
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'tg-1' } as never);
  });

  function createFor(scopeId: string) {
    return service.create(actor(), {
      scopeType: 'membership',
      scopeId,
      metricCode: 'revenue',
      periodType: 'monthly',
      periodStart: '2026-08-01',
      targetValue: 100_000,
    } as never);
  }

  it('creates a target for an active member', async () => {
    await expect(createFor('m-active')).resolves.toEqual({ id: 'tg-1' });
    expect(prisma.target.create).toHaveBeenCalledTimes(1);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'm-active', status: 'active' }),
      }),
    );
  });

  it.each(['m-suspended', 'm-ended'])('rejects creating a target scoped to %s', async (scopeId) => {
    await expect(createFor(scopeId)).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    expect(prisma.target.create).not.toHaveBeenCalled();
  });

  it('still edits an existing target whose member was since suspended when the scope is unchanged', async () => {
    (prisma.target.findFirst as jest.Mock).mockResolvedValue(existingTarget('m-suspended'));
    await expect(
      service.update(actor(), 'tg-1', { targetValue: 120_000, version: 1 } as never),
    ).resolves.toEqual({ id: 'tg-1' });
    // Re-sending the same scope explicitly counts as unchanged too.
    await expect(
      service.update(actor(), 'tg-1', {
        scopeType: 'membership',
        scopeId: 'm-suspended',
        notes: 'Covering leave',
      } as never),
    ).resolves.toEqual({ id: 'tg-1' });
    expect(prisma.target.update).toHaveBeenCalledTimes(2);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm-suspended', tenantId: TENANT_A, deletedAt: null },
      }),
    );
  });

  it('rejects moving a target onto a suspended or ended member', async () => {
    (prisma.target.findFirst as jest.Mock).mockResolvedValue(existingTarget('m-active'));
    for (const scopeId of ['m-suspended', 'm-ended']) {
      await expect(
        service.update(actor(), 'tg-1', { scopeType: 'membership', scopeId } as never),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    }
    expect(prisma.target.update).not.toHaveBeenCalled();
  });

  it('rejects an edit of an ended member target (the membership no longer exists)', async () => {
    (prisma.target.findFirst as jest.Mock).mockResolvedValue(existingTarget('m-ended'));
    await expect(
      service.update(actor(), 'tg-1', { targetValue: 1 } as never),
    ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
  });
});
