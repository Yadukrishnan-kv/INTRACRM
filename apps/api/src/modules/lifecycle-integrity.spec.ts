import { ErrorCodes } from '../common/exceptions/error-codes';
import { actor, MEMBERSHIP_A, TENANT_A, USER_A } from '../testing/fixtures';
import { createPrismaMock, PrismaMock } from '../testing/prisma-mock';
import { leadDetailRow } from '../testing/rows';
import { TimelineWriter } from './activities/application/timeline.writer';
import { AuditWriter } from './audit/application/audit.writer';
import { CatalogService } from './catalog/application/catalog.service';
import { LeadsService } from './crm-leads/application/leads.service';
import { StaffService } from './directory/application/staff.service';
import { TeamService } from './directory/application/team.service';
import { QuotationsService } from './quotations/application/quotations.service';
import { FollowUpEngineService } from './tasks/application/follow-up-engine.service';
import { FollowUpsService } from './tasks/application/follow-ups.service';
import { WarrantiesService } from './warranties/application/warranties.service';
import { configStub } from '../testing/config-stub';

const now = new Date('2026-08-17T10:00:00.000Z');

function followUpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fu-1',
    type: 'call',
    title: 'Call back',
    notes: null,
    dueAt: now,
    remindAt: null,
    priority: 2,
    status: 'pending',
    assignedToMembershipId: MEMBERSHIP_A,
    completedAt: null,
    rescheduleCount: 0,
    lastRescheduledAt: null,
    version: 1,
    leadId: 'lead-1',
    assignee: { user: { fullName: 'Ada' }, userId: USER_A },
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
    ...overrides,
  };
}

function quotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    quotationNumber: 'QT-0001',
    status: 'sent',
    version: 1,
    leadId: 'lead-1',
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Door', customerName: 'Acme', deletedAt: now },
    items: [],
    ...overrides,
  };
}

describe('lead deletion and lifecycle integrity', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ id: TENANT_A, timezone: 'Asia/Kolkata' });
  });

  function followUps() {
    return new FollowUpsService(
      prisma as never,
      new TimelineWriter(prisma as never),
      new FollowUpEngineService(prisma as never, { notify: jest.fn(), notifyInApp: jest.fn() } as never),
      new AuditWriter(prisma as never),
    );
  }

  function quotations() {
    return new QuotationsService(
      prisma as never,
      { record: jest.fn() } as never,
      { dashboard: jest.fn(), tickForActor: jest.fn() } as never,
      { record: jest.fn() } as never,
      { syncWonQuotation: jest.fn() } as never,
    );
  }

  it('cancels pending follow-ups and scheduled site visits when a lead is deleted', async () => {
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(leadDetailRow({ id: 'lead-1' }));
    const leads = new LeadsService(
      prisma as never,
      { ensureDefaults: jest.fn() } as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    await expect(leads.remove(actor(), 'lead-1')).resolves.toEqual({ id: 'lead-1', deleted: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(prisma.followUp.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, leadId: 'lead-1', status: 'pending', deletedAt: null },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
    expect(prisma.siteVisit.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, leadId: 'lead-1', status: 'scheduled', deletedAt: null },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
  });

  it('follow-up engine and list skip follow-ups on deleted leads', async () => {
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: TENANT_A, timezone: 'Asia/Kolkata' }]);
    const engine = new FollowUpEngineService(prisma as never, { notify: jest.fn(), notifyInApp: jest.fn() } as never);
    await engine.tick({ tenantId: TENANT_A });
    expect(prisma.followUp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending', lead: { deletedAt: null } }),
      }),
    );
    expect(engine.bucketWhere('overdue', TENANT_A, now, 'Asia/Kolkata')).toMatchObject({
      lead: { deletedAt: null },
    });

    (prisma.followUp.findMany as jest.Mock).mockClear();
    await followUps().list(actor(), {} as never);
    expect(prisma.followUp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ lead: { deletedAt: null } }) }),
    );
  });

  it('cancels a pending follow-up and rejects cancelling one that is not pending', async () => {
    (prisma.followUp.findFirst as jest.Mock).mockResolvedValue(followUpRow());
    (prisma.followUp.update as jest.Mock).mockResolvedValue(followUpRow({ status: 'cancelled', version: 2 }));
    await expect(followUps().cancel(actor(), 'fu-1', { reason: 'Customer asked' })).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(prisma.followUp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );

    for (const status of ['completed', 'cancelled', 'skipped']) {
      (prisma.followUp.findFirst as jest.Mock).mockResolvedValue(followUpRow({ status }));
      await expect(followUps().cancel(actor(), 'fu-1', {})).rejects.toMatchObject({
        code: ErrorCodes.CONFLICT,
      });
    }

    (prisma.followUp.findFirst as jest.Mock).mockResolvedValue(followUpRow({ version: 3 }));
    await expect(followUps().cancel(actor(), 'fu-1', { version: 1 })).rejects.toMatchObject({
      code: ErrorCodes.STALE_VERSION,
    });
  });

  it('keeps quotations on a deleted lead read-only and out of lists and search', async () => {
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(quotationRow({ status: 'draft' }));
    await expect(quotations().send(actor(), 'q-1', {} as never)).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(quotationRow());
    await expect(
      quotations().changeStatus(actor(), 'q-1', { status: 'won' } as never),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });
    expect(prisma.quotation.update).not.toHaveBeenCalled();

    await quotations().list(actor(), {} as never);
    expect(prisma.quotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ lead: { deletedAt: null } }) }),
    );
  });

  it('refuses to issue a warranty from a quotation on a deleted lead', async () => {
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue({
      id: 'q-1',
      leadId: 'lead-1',
      status: 'won',
      lead: { deletedAt: now },
    });
    const warranties = new WarrantiesService(prisma as never, { record: jest.fn() } as never, configStub() as never);
    await expect(
      warranties.create(actor(), {
        quotationId: 'q-1',
        warrantyStartOn: '2026-08-17',
        warrantyEndOn: '2027-08-17',
        items: [],
      } as never),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });
    expect(prisma.warrantyCard.create).not.toHaveBeenCalled();
  });

  it('ignores items on deleted quotations when checking catalog usage', async () => {
    const catalog = new CatalogService(prisma as never, { ensureDefaults: jest.fn() } as never);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue({ id: 'prod-1' });
    await expect(catalog.deleteProduct(actor(), 'prod-1')).resolves.toEqual({ deleted: true });
    expect(prisma.quotationItem.count).toHaveBeenCalledWith({
      where: { productId: 'prod-1', deletedAt: null, quotation: { deletedAt: null } },
    });

    (prisma.taxRate.findFirst as jest.Mock).mockResolvedValue({ id: 'tax-1' });
    await catalog.deleteTax(actor(), 'tax-1').catch(() => undefined);
    expect(prisma.quotationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, deletedAt: null, quotation: { deletedAt: null } },
      }),
    );
  });
});

describe('staff lifecycle', () => {
  it('DELETE /staff/:id ends the membership through RbacService', async () => {
    const prisma = createPrismaMock();
    const rbac = { updateMembership: jest.fn().mockResolvedValue({}) };
    const staff = new StaffService(prisma as never, rbac as never, new TeamService(prisma as never));
    await expect(staff.remove(actor(), 'm-2')).resolves.toEqual({ id: 'm-2', removed: true });
    expect(rbac.updateMembership).toHaveBeenCalledWith(actor(), 'm-2', { status: 'ended' });
  });

  it('only adds active members to a team', async () => {
    const prisma = createPrismaMock();
    const teams = new TeamService(prisma as never);
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({
      id: 'team-1',
      code: 'sales',
      name: 'Sales',
      isActive: true,
      members: [],
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      teams.replaceMembers(actor(), 'team-1', { membershipIds: ['m-suspended'] } as never),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ status: 'active' }, { teamLinks: { some: { teamId: 'team-1' } } }],
      }),
    });
  });
});
