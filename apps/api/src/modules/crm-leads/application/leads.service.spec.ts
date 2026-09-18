import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor, MEMBERSHIP_A, TENANT_A, TENANT_B } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { leadDetailRow, leadListRow, membershipRow } from '../../../testing/rows';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  const prisma = createPrismaMock();
  const catalog = { ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p' }, firstStage: { id: 's' } }) };
  const followUps = { listForLead: jest.fn(), create: jest.fn(), complete: jest.fn() };
  const notifications = { notify: jest.fn() };
  const audit = { record: jest.fn() };
  const tracks = { listForResource: jest.fn(), list: jest.fn().mockResolvedValue({ data: [] }) };
  const service = new LeadsService(
    prisma as never,
    catalog as never,
    followUps as never,
    notifications as never,
    audit as never,
    tracks as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.ensureDefaults.mockResolvedValue({ pipeline: { id: 'p' }, firstStage: { id: 's' } });
  });

  it('requires a tenant', async () => {
    await expect(service.lookups({ userId: 'u', sessionId: 's' })).rejects.toMatchObject({
      code: ErrorCodes.TENANT_REQUIRED,
    });
  });

  it('returns lookups for the actor tenant', async () => {
    (prisma.leadSource.findMany as jest.Mock).mockResolvedValue([{ id: 'src', code: 'web', name: 'Web' }]);
    (prisma.pipeline.findMany as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Sales', isDefault: true, stages: [{ id: 's1', name: 'New', sortOrder: 1 }] },
    ]);
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      { id: 'm1', designation: 'AE', user: { fullName: 'Ada' } },
    ]);
    (prisma.leadQualityOption.findMany as jest.Mock).mockResolvedValue([{ code: 'hot', name: 'Hot' }]);
    const result = await service.lookups(actor());
    expect(result.sources[0]?.code).toBe('web');
    expect(prisma.leadSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('does not return another tenant lead by id', async () => {
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.get(actor(), 'lead-from-tenant-b')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, id: 'lead-from-tenant-b' }),
      }),
    );
    await expect(service.get(actor({ tenantId: TENANT_B }), 'lead-from-tenant-b')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });

  it('rejects an invalid list cursor', async () => {
    await expect(service.list(actor(), { cursor: '%%%' })).rejects.toMatchObject({
      code: ErrorCodes.BAD_REQUEST,
    });
  });

  it('lists a page of leads', async () => {
    (prisma.lead.findMany as jest.Mock).mockResolvedValue([]);
    const result = await service.list(actor(), { q: 'acme' });
    expect(result.data).toEqual([]);
    expect(result.page.hasMore).toBe(false);
  });

  it('requires assigned staff on create', async () => {
    await expect(
      service.create({ userId: actor().userId, sessionId: actor().sessionId, tenantId: TENANT_A }, { title: 'Need a door' }),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
  });

  it('creates, reads, updates, assigns, reports, and archives a lead', async () => {
    const detail = leadDetailRow();
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(membershipRow());
    (prisma.lead.create as jest.Mock).mockResolvedValue({ id: 'lead-1' });
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(detail);
    (prisma.leadActivity.create as jest.Mock).mockResolvedValue({
      id: 'act-1',
      type: 'system',
      subject: 'Lead Created',
      body: 'Lead LD-0001 created.',
      occurredAt: new Date(),
    });

    const created = await service.create(actor(), {
      title: 'Need a door',
      primaryPhone: '9999999999',
      customerName: 'Acme',
      estimatedValueMinor: 125000,
    });
    expect(created.leadNumber).toBe('LD-0001');
    expect(audit.record).toHaveBeenCalled();

    await expect(service.get(actor(), 'lead-1')).resolves.toMatchObject({ id: 'lead-1', title: 'Need a door' });

    (prisma.lead.findMany as jest.Mock).mockResolvedValue([
      leadListRow(),
      leadListRow({ id: 'lead-2', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
    ]);
    const page = await service.list(actor(), { limit: 1, quality: 'hot', sourceId: 'src-1' });
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).toBeTruthy();

    await service.update(actor(), 'lead-1', { title: 'Need two doors', version: 1 });
    await expect(service.update(actor(), 'lead-1', { title: 'stale', version: 99 })).rejects.toMatchObject({
      code: ErrorCodes.STALE_VERSION,
    });

    await expect(service.assign(actor(), 'lead-1', { ownerMembershipId: MEMBERSHIP_A })).resolves.toMatchObject({
      id: 'lead-1',
    });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(membershipRow({ id: 'other-staff', userId: 'other' }));
    await service.assign(actor(), 'lead-1', { ownerMembershipId: 'other-staff', reason: 'handoff' });
    expect(notifications.notify).toHaveBeenCalled();

    (prisma.lead.findMany as jest.Mock).mockResolvedValue([
      {
        lifecycleStatus: 'open',
        quality: 'hot',
        sourceId: 'src-1',
        source: { id: 'src-1', name: 'Web' },
        ownerMembershipId: MEMBERSHIP_A,
        owner: { user: { fullName: 'Ada' } },
        stage: { name: 'New' },
        city: 'Pune',
        estimatedValueMinor: 100n,
      },
    ]);
    const report = await service.report(actor(), { from: '2026-01-01', to: '2026-12-31' });
    expect(report.totals.total).toBe(1);

    await expect(service.remove(actor(), 'lead-1')).resolves.toEqual({ id: 'lead-1', deleted: true });
  });

  it('lists assignments, tracks, activities, and follow-ups for a lead', async () => {
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(leadDetailRow());
    (prisma.leadAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'as-1',
        assignedFromMembershipId: null,
        from: null,
        assignedToMembershipId: MEMBERSHIP_A,
        to: { user: { fullName: 'Ada' } },
        assignedByMembershipId: MEMBERSHIP_A,
        by: { user: { fullName: 'Ada' } },
        reason: 'created',
        isCurrent: true,
        assignedAt: new Date(),
      },
    ]);
    tracks.list = jest.fn().mockResolvedValue({ data: [], page: { hasMore: false } });
    (prisma.leadActivity.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'act-1',
        type: 'note',
        subject: 'Hello',
        body: 'Hi',
        occurredAt: new Date(),
        actor: { user: { fullName: 'Ada' } },
      },
    ]);
    followUps.listForLead.mockResolvedValue([]);
    followUps.create.mockResolvedValue({ id: 'fu-1' });
    followUps.complete.mockResolvedValue({ id: 'fu-1', status: 'completed' });

    await expect(service.listAssignments(actor(), 'lead-1')).resolves.toHaveLength(1);
    await service.listTracks(actor(), 'lead-1', {});
    await expect(service.listActivities(actor(), 'lead-1', {})).resolves.toMatchObject({
      data: [expect.objectContaining({ subject: 'Hello' })],
    });
    await service.listFollowUps(actor(), 'lead-1');
    await service.addFollowUp(actor(), 'lead-1', { dueAt: new Date().toISOString(), type: 'call' } as never);
    await service.completeFollowUp(actor(), 'lead-1', 'fu-1', {} as never);
    (prisma.leadActivity.create as jest.Mock).mockResolvedValue({
      id: 'act-2',
      type: 'note',
      subject: 'Note',
      body: 'Body',
      occurredAt: new Date(),
    });
    await expect(
      service.addActivity(actor(), 'lead-1', { type: 'note', subject: 'Note', body: 'Body' } as never),
    ).resolves.toMatchObject({ subject: 'Note' });
  });
});
