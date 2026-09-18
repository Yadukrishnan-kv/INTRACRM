import { actor, MEMBERSHIP_A, TENANT_A } from '../testing/fixtures';
import { createPrismaMock } from '../testing/prisma-mock';
import { namedRow } from '../testing/rows';
import { encodeCursor } from '../common/pagination/cursor-page';
import { AnalyticsService } from './analytics/application/analytics.service';
import { PipelineService } from './pipeline/application/pipeline.service';
import { TargetsService } from './targets/application/targets.service';
import { QuotationsService } from './quotations/application/quotations.service';
import { CatalogService } from './catalog/application/catalog.service';
import { TracksService } from './audit/application/tracks.service';

const now = new Date();

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tg-1',
    scopeType: 'tenant',
    scopeId: null,
    productId: null,
    metricCode: 'revenue',
    periodType: 'monthly',
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    targetValue: 100000,
    notes: null,
    version: 1,
    createdAt: now,
    kpi: { name: 'Revenue', unit: 'inr' },
    product: null,
    ...overrides,
  };
}

describe('data-rich coverage for aggregating services', () => {
  const user = actor();
  const prisma = createPrismaMock();

  beforeEach(() => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      timezone: 'Asia/Kolkata',
    });
  });

  it('builds analytics and pipeline boards from populated rows', async () => {
    const createdAt = now;
    (prisma.pipelineStage.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's-new',
        pipelineId: 'p1',
        code: 'new',
        name: 'New',
        sortOrder: 1,
        winProbabilityBps: 0,
        isOpen: true,
        isWon: false,
        isLost: false,
      },
      {
        id: 's-qual',
        pipelineId: 'p1',
        code: 'qualified',
        name: 'Qualified',
        sortOrder: 2,
        winProbabilityBps: 4000,
        isOpen: true,
        isWon: false,
        isLost: false,
      },
      {
        id: 's-won',
        pipelineId: 'p1',
        code: 'won',
        name: 'Won',
        sortOrder: 9,
        winProbabilityBps: 10000,
        isOpen: false,
        isWon: true,
        isLost: false,
      },
    ]);
    (prisma.lead.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'lead-1',
        createdAt,
        sourceId: 'src-1',
        source: { name: 'Web' },
        stageId: 's-qual',
        lifecycleStatus: 'open',
        estimatedValueMinor: 25000n,
        leadNumber: 'LD-1',
        title: 'Need a door',
        customerName: 'Acme',
        primaryPhone: '+919999999999',
        quality: 'hot',
        currency: 'INR',
        ownerMembershipId: MEMBERSHIP_A,
        owner: { user: { fullName: 'Ada' } },
        stage: { name: 'Qualified' },
        version: 1,
        updatedAt: createdAt,
      },
      {
        id: 'lead-2',
        createdAt,
        sourceId: null,
        source: null,
        stageId: 's-won',
        lifecycleStatus: 'won',
        estimatedValueMinor: 50000n,
        leadNumber: 'LD-2',
        title: 'Gate',
        customerName: 'Beta',
        primaryPhone: null,
        quality: 'warm',
        currency: 'INR',
        ownerMembershipId: MEMBERSHIP_A,
        owner: { user: { fullName: 'Ada' } },
        stage: { name: 'Won' },
        version: 1,
        updatedAt: createdAt,
      },
    ]);
    (prisma.leadStageChange.findMany as jest.Mock).mockResolvedValue([
      { leadId: 'lead-1', changedAt: createdAt, toStageId: 's-qual' },
    ]);
    (prisma.quotation.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'q-1',
        leadId: 'lead-1',
        createdAt,
        status: 'sent',
        totalMinor: 10000n,
        wonAt: createdAt,
      },
      {
        id: 'q-2',
        leadId: 'lead-2',
        createdAt,
        status: 'won',
        totalMinor: 50000n,
        wonAt: createdAt,
      },
    ]);
    const analytics = new AnalyticsService(prisma as never);
    const board = await analytics.overview(user);
    expect(board.widgets.leads.primary).toBeGreaterThanOrEqual(0);
    await expect(analytics.widget(user, 'quotations')).resolves.toBeDefined();
    await expect(analytics.widget(user, 'won')).resolves.toBeDefined();
    await expect(analytics.funnelReport(user)).resolves.toBeDefined();

    (prisma.lossReason.findMany as jest.Mock).mockResolvedValue([{ id: 'lr-1', code: 'price', name: 'Price' }]);
    const pipeline = new PipelineService(
      prisma as never,
      { ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1', name: 'Default', code: 'default' } }) } as never,
      { record: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    const kanban = await pipeline.board(user, { limit: 1 });
    expect(kanban.columns.length).toBeGreaterThan(0);
    expect(kanban.totals.leads).toBe(2);
    await expect(pipeline.analytics(user, 'p1')).resolves.toMatchObject({
      pipeline: { id: 'p1' },
    });
    (prisma.pipeline.findFirst as jest.Mock).mockResolvedValue({ id: 'p2', name: 'Alt', code: 'alt' });
    await expect(pipeline.board(user, { pipelineId: 'p2' })).resolves.toBeDefined();
  });

  it('scores populated targets across scopes and metrics', async () => {
    const rows = [
      targetRow(),
      targetRow({
        id: 'tg-team',
        scopeType: 'team',
        scopeId: 'team-1',
        metricCode: 'leads_created',
        kpi: { name: 'Leads', unit: 'count' },
      }),
      targetRow({
        id: 'tg-member',
        scopeType: 'membership',
        scopeId: MEMBERSHIP_A,
        metricCode: 'visits_completed',
        productId: 'prod-1',
        product: { name: 'Door', sku: 'SKU-1' },
        kpi: { name: 'Visits', unit: 'count' },
      }),
      targetRow({
        id: 'tg-branch',
        scopeType: 'branch',
        scopeId: 'br-1',
        metricCode: 'units_sold',
        kpi: { name: 'Units', unit: 'count' },
      }),
      targetRow({
        id: 'tg-won',
        metricCode: 'leads_won',
        kpi: { name: 'Won', unit: 'count' },
      }),
      targetRow({
        id: 'tg-fu',
        metricCode: 'follow_ups_completed',
        kpi: { name: 'Follow-ups', unit: 'count' },
      }),
      targetRow({
        id: 'tg-qa',
        metricCode: 'quotations_accepted',
        kpi: { name: 'Accepted', unit: 'count' },
      }),
    ];
    (prisma.target.findMany as jest.Mock).mockResolvedValue(rows);
    (prisma.target.findFirst as jest.Mock).mockResolvedValue(rows[0]);
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1',
      user: { fullName: 'Ada' },
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([{ id: MEMBERSHIP_A }]);
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ name: 'Sales' });
    (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({ code: 'revenue' });
    const targets = new TargetsService(prisma as never);
    await expect(targets.progress(user)).resolves.toMatchObject({ month: expect.any(Object) });
    await expect(targets.currentForStaff(user)).resolves.toEqual(expect.any(Array));
    await expect(
      targets.list(user, {
        periodType: 'monthly',
        scopeType: 'team',
        teamId: 'team-1',
        scopeId: 'team-1',
        productId: 'prod-1',
        hasProduct: true,
        metricCode: 'revenue',
        current: true,
        cursor: encodeCursor({ createdAt: now.toISOString(), id: 'tg-1' }),
      } as never),
    ).resolves.toMatchObject({ data: expect.any(Array) });
    await expect(targets.list(user, { cursor: 'bad' } as never)).rejects.toBeDefined();
    await expect(
      targets.report(user, {
        periodType: 'monthly',
        scopeType: 'tenant',
        from: '2026-08-01',
        to: '2026-08-31',
      } as never),
    ).resolves.toBeDefined();
    for (const row of rows) {
      (prisma.target.findFirst as jest.Mock).mockResolvedValue(row);
      await expect(targets.get(user, row.id as string)).resolves.toMatchObject({ id: row.id });
    }
  });

  it('lists quotation buckets, catalog qualities, and populated reports', async () => {
    (prisma.quotation.findMany as jest.Mock).mockResolvedValue([]);
    const quotations = new QuotationsService(
      prisma as never,
      { record: jest.fn() } as never,
      { dashboard: jest.fn(), tickForActor: jest.fn(), notifyPendingQuotation: jest.fn() } as never,
      { record: jest.fn() } as never,
      { syncWonQuotation: jest.fn() } as never,
    );
    for (const bucket of ['pending', 'overdue', 'today', 'upcoming', 'no_follow_up', 'closing_soon', 'closing_overdue', 'other']) {
      await expect(quotations.list(user, { bucket } as never)).resolves.toMatchObject({ data: [] });
    }

    const catalog = new CatalogService(prisma as never, {
      ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1' }, firstStage: { id: 's1' } }),
    } as never);
    const quality = namedRow({ code: 'hot', name: 'Hot' });
    (prisma.leadQualityOption.findMany as jest.Mock).mockResolvedValue([quality]);
    (prisma.leadQualityOption.findFirst as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue(quality);
    (prisma.leadQualityOption.create as jest.Mock).mockResolvedValue(quality);
    (prisma.leadQualityOption.update as jest.Mock).mockResolvedValue({ ...quality, name: 'Very hot' });
    await expect(catalog.listQualities(user, true)).resolves.toHaveLength(1);
    await expect(catalog.createQuality(user, { code: 'hot', name: 'Hot' })).resolves.toMatchObject({ code: 'hot' });
    await expect(catalog.updateQuality(user, quality.id, { name: 'Very hot' })).resolves.toMatchObject({
      name: 'Very hot',
    });
    (prisma.lead.count as jest.Mock).mockResolvedValue(0);
    await expect(catalog.deleteQuality(user, quality.id)).resolves.toEqual({ deleted: true });
    (prisma.warrantyPeriod.findMany as jest.Mock).mockResolvedValue([{ ...namedRow({ code: 'y1' }), months: 12 }]);
    await expect(catalog.listWarrantyPeriods(user, true)).resolves.toHaveLength(1);

    (prisma.lead.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([]);
    const tracks = new TracksService(prisma as never);
    await expect(
      tracks.list(user, {
        action: 'create',
        resourceType: 'lead',
        actorUserId: user.userId,
        from: now.toISOString(),
        to: now.toISOString(),
        cursor: encodeCursor({ createdAt: now.toISOString(), id: 't-1' }),
      } as never),
    ).resolves.toMatchObject({ data: [] });
  });
});
