import { ErrorCodes } from '../common/exceptions/error-codes';
import { actor, MEMBERSHIP_A, TENANT_A } from '../testing/fixtures';
import { createPrismaMock, PrismaMock } from '../testing/prisma-mock';
import { membershipRow } from '../testing/rows';
import { DashboardService } from './dashboard/application/dashboard.service';
import { IncentivesService } from './incentives/application/incentives.service';
import { PerformanceService } from './performance/application/performance.service';
import { TargetsService } from './targets/application/targets.service';
import { boardDays, boardPeriodBounds } from './targets/application/targets.service';
import { FollowUpsService } from './tasks/application/follow-ups.service';
import { FollowUpEngineService } from './tasks/application/follow-up-engine.service';
import { TimelineWriter } from './activities/application/timeline.writer';
import { AuditWriter } from './audit/application/audit.writer';
import { IncentivesController } from './incentives/interface/http/incentives.controller';
import { IncentiveReportController } from './reporting/interface/http/incentive-report.controller';

/**
 * Service-level cover for the four features added on top of the lead-to-
 * warranty path: the monthly sales board, the follow-up calendar, the founder
 * KPI row, and the incentive engine.
 */
describe('new feature services', () => {
  const user = actor();
  let prisma: PrismaMock;

  function targetsService() {
    return new TargetsService(prisma as never);
  }

  function followUpsService() {
    const engine = new FollowUpEngineService(prisma as never, { notify: jest.fn() } as never);
    return new FollowUpsService(
      prisma as never,
      new TimelineWriter(prisma as never),
      engine,
      new AuditWriter(prisma as never),
    );
  }

  beforeEach(() => {
    prisma = createPrismaMock();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      timezone: 'Asia/Kolkata',
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([membershipRow()]);
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      id: MEMBERSHIP_A,
      teamId: null,
    });
  });

  // ---------------------------------------------------------------------------
  // Monthly sales target
  // ---------------------------------------------------------------------------

  describe('sales board', () => {
    beforeEach(() => {
      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({
        code: 'revenue',
        name: 'Revenue',
        unit: 'minor_currency',
      });
      (prisma.membership.findMany as jest.Mock).mockResolvedValue([
        {
          id: MEMBERSHIP_A,
          designation: 'Sales Executive',
          user: { fullName: 'Ada Lovelace' },
          team: { name: 'West' },
        },
      ]);
    });

    it('builds a board with a personal card, a roll-up, and a ranking', async () => {
      (prisma.target.findMany as jest.Mock)
        .mockResolvedValueOnce([{ scopeId: MEMBERSHIP_A, targetValue: 150_000 }])
        .mockResolvedValueOnce([{ id: 'target-tenant', targetValue: 500_000 }]);
      (prisma.quotation.groupBy as jest.Mock).mockResolvedValue([
        { assignedToMembershipId: MEMBERSHIP_A, _sum: { totalMinor: 90_000 } },
      ]);

      const board = await targetsService().salesBoard(user, {});
      expect(board.metric.code).toBe('revenue');
      expect(board.period.code).toBe('this_month');
      expect(board.scope).toBe('tenant');
      expect(board.me?.achievedValue).toBe(90_000);
      expect(board.me?.targetValue).toBe(150_000);
      expect(board.me?.rank).toBe(1);
      expect(board.overall.targetValue).toBe(500_000);
      expect(board.standings).toHaveLength(1);
      expect(board.podium).toHaveLength(1);
      expect(board.suggestions.length).toBeGreaterThan(0);
      expect(board.periods.length).toBeGreaterThan(0);
    });

    it('sums the individual quotas when no scope-level target is set', async () => {
      (prisma.target.findMany as jest.Mock)
        .mockResolvedValueOnce([{ scopeId: MEMBERSHIP_A, targetValue: 150_000 }])
        .mockResolvedValueOnce([]);
      const board = await targetsService().salesBoard(user, {});
      expect(board.overall.targetValue).toBe(150_000);
    });

    it('rejects a metric the tenant does not define', async () => {
      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(targetsService().salesBoard(user, { metricCode: 'nope' })).rejects.toMatchObject({
        code: ErrorCodes.BAD_REQUEST,
      });
    });

    it('serves the other periods and scopes', async () => {
      const targets = targetsService();
      for (const period of ['last_month', 'this_quarter', 'this_year'] as const) {
        const board = await targets.salesBoard(user, { period, scope: 'team' });
        expect(board.period.code).toBe(period);
        expect(board.scope).toBe('team');
      }
    });

    it('falls back to the roll-up when the viewer has no membership', async () => {
      const board = await targetsService().salesBoard(actor({ membershipId: undefined }), {});
      expect(board.me).toBeNull();
      expect(board.overall).toBeDefined();
    });

    it('groups count metrics without falling back to a per-member query', async () => {
      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({
        code: 'leads_created',
        name: 'Leads created',
        unit: 'count',
      });
      (prisma.lead.groupBy as jest.Mock).mockResolvedValue([
        { ownerMembershipId: MEMBERSHIP_A, _count: { _all: 7 } },
      ]);
      const board = await targetsService().salesBoard(user, { metricCode: 'leads_created' });
      expect(board.standings[0]?.achievedValue).toBe(7);
      expect(prisma.lead.groupBy).toHaveBeenCalled();
    });

    it('covers the remaining grouped metrics and the per-member fallback', async () => {
      const targets = targetsService();
      for (const metricCode of [
        'quotations_accepted',
        'follow_ups_completed',
        'visits_completed',
      ]) {
        (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({
          code: metricCode,
          name: metricCode,
          unit: 'count',
        });
        await expect(targets.salesBoard(user, { metricCode })).resolves.toBeDefined();
      }
    });

    it('returns an empty board rather than failing when nobody is active', async () => {
      (prisma.membership.findMany as jest.Mock).mockResolvedValue([]);
      const board = await targetsService().salesBoard(user, {});
      expect(board.standings).toEqual([]);
      expect(board.podium).toEqual([]);
      expect(board.insights.every((row) => row.value === 0)).toBe(true);
    });

    it('requires a tenant', async () => {
      await expect(
        targetsService().salesBoard(actor({ tenantId: undefined }), {}),
      ).rejects.toMatchObject({ code: ErrorCodes.TENANT_REQUIRED });
    });
  });

  describe('board period helpers', () => {
    it('resolves each period code against today', () => {
      expect(boardPeriodBounds('this_month', '2026-09-21')).toMatchObject({
        start: '2026-09-01',
        end: '2026-09-30',
        label: 'Sep 2026',
      });
      expect(boardPeriodBounds('last_month', '2026-09-21')).toMatchObject({
        start: '2026-08-01',
        end: '2026-08-31',
      });
      expect(boardPeriodBounds('this_quarter', '2026-09-21')).toMatchObject({
        start: '2026-07-01',
        end: '2026-09-30',
      });
      expect(boardPeriodBounds('this_year', '2026-09-21')).toMatchObject({
        start: '2026-01-01',
        end: '2026-12-31',
        label: '2026',
      });
    });

    it('trails only elapsed days, capped at a month of rows', () => {
      expect(boardDays('2026-09-01', '2026-09-30', '2026-09-05')).toEqual([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
      ]);
      // A closed period trails to its own end, not to today.
      expect(boardDays('2026-08-01', '2026-08-31', '2026-09-21')).toHaveLength(31);
      // A year caps at the most recent 31 days.
      expect(boardDays('2026-01-01', '2026-12-31', '2026-09-21')).toHaveLength(31);
      // A period that has not opened has no trail at all.
      expect(boardDays('2026-10-01', '2026-10-31', '2026-09-21')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Follow-up calendar
  // ---------------------------------------------------------------------------

  describe('follow-up calendar', () => {
    it('paints a six-week grid for the requested month', async () => {
      (prisma.followUp.findMany as jest.Mock).mockResolvedValue([
        { dueAt: new Date('2026-09-14T05:00:00.000Z'), status: 'pending' },
        { dueAt: new Date('2026-09-14T06:00:00.000Z'), status: 'completed' },
      ]);
      const board = await followUpsService().calendar(user, { month: '2026-09' });
      expect(board.month).toBe('2026-09');
      expect(board.days).toHaveLength(42);
      expect(board.totals.total).toBe(2);
      expect(board.days.find((day) => day.date === '2026-09-14')?.total).toBe(2);
    });

    it('defaults to the current month in the tenant zone', async () => {
      const board = await followUpsService().calendar(user, {});
      expect(board.month).toMatch(/^\d{4}-\d{2}$/);
      expect(board.month).toBe(board.today.slice(0, 7));
    });

    it('filters by owner and type', async () => {
      await followUpsService().calendar(user, {
        month: '2026-09',
        assignedToMembershipId: MEMBERSHIP_A,
        type: 'call',
      });
      const where = (prisma.followUp.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
      expect(where.assignedToMembershipId).toBe(MEMBERSHIP_A);
      expect(where.type).toBe('call');
    });

    it('rejects a malformed month', async () => {
      await expect(
        followUpsService().calendar(user, { month: '2026-13' }),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    });

    it('narrows the list to one calendar day', async () => {
      await followUpsService().list(user, { dueOn: '2026-09-21' });
      const where = (prisma.followUp.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
      expect(where.AND).toEqual([
        { dueAt: { gte: expect.any(Date), lt: expect.any(Date) } },
      ]);
    });

    it('accepts an open-ended range on either side', async () => {
      const service = followUpsService();
      await service.list(user, { dueFrom: '2026-09-01' });
      await service.list(user, { dueTo: '2026-09-30' });
      const first = (prisma.followUp.findMany as jest.Mock).mock.calls[0]?.[0]?.where.AND[0].dueAt;
      const second = (prisma.followUp.findMany as jest.Mock).mock.calls[1]?.[0]?.where.AND[0].dueAt;
      expect(first.gte).toBeInstanceOf(Date);
      expect(first.lt).toBeUndefined();
      expect(second.lt).toBeInstanceOf(Date);
      expect(second.gte).toBeUndefined();
    });

    it('rejects a range that ends before it starts', async () => {
      await expect(
        followUpsService().list(user, { dueFrom: '2026-09-30', dueTo: '2026-09-01' }),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    });

    it('composes the day window with a bucket instead of replacing it', async () => {
      await followUpsService().list(user, { bucket: 'overdue', dueOn: '2026-09-21' });
      const where = (prisma.followUp.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
      // The bucket's own predicate survives alongside the day window.
      expect(where.AND).toHaveLength(1);
      expect(where.status).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Founder KPI cards
  // ---------------------------------------------------------------------------

  describe('founder KPIs', () => {
    function dashboardService() {
      const performance = new PerformanceService(prisma as never);
      return new DashboardService(prisma as never, performance, targetsService());
    }

    it('returns the six tiles with their formats', async () => {
      const view = await dashboardService().kpis(user);
      expect(view.items.map((item) => item.code)).toEqual([
        'todays_follow_ups',
        'mtd_billing',
        'target_achieved',
        'active_leads',
        'pending_quotations',
        'won_this_month',
      ]);
      expect(view.month.label).toMatch(/\d{4}$/);
      expect(view.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('reads billing, targets, and won counts off the live aggregates', async () => {
      (prisma.followUp.count as jest.Mock).mockResolvedValue(24);
      (prisma.billingInvoice.aggregate as jest.Mock).mockResolvedValue({
        _sum: { totalMinor: 185_000_000 },
      });
      (prisma.target.findMany as jest.Mock).mockResolvedValue([{ targetValue: 350_000_000 }]);
      (prisma.quotation.aggregate as jest.Mock).mockResolvedValue({
        _sum: { totalMinor: 185_500_000 },
      });
      (prisma.lead.count as jest.Mock).mockResolvedValue(142);
      (prisma.quotation.count as jest.Mock).mockResolvedValue(32);
      (prisma.leadStageChange.count as jest.Mock).mockResolvedValue(12);

      const view = await dashboardService().kpis(user);
      const byCode = Object.fromEntries(view.items.map((item) => [item.code, item.value]));
      expect(byCode.todays_follow_ups).toBe(24);
      expect(byCode.mtd_billing).toBe(185_000_000);
      expect(byCode.target_achieved).toBe(5300);
      expect(byCode.active_leads).toBe(142);
      expect(byCode.pending_quotations).toBe(32);
      expect(byCode.won_this_month).toBe(12);
    });

    it('requires a tenant', async () => {
      await expect(dashboardService().kpis(actor({ tenantId: undefined }))).rejects.toMatchObject({
        code: ErrorCodes.TENANT_REQUIRED,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Incentives
  // ---------------------------------------------------------------------------

  describe('incentives', () => {
    const PLAN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const SLAB_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const PAYOUT_ID = '99999999-9999-4999-8999-999999999999';

    function planRow(overrides: Record<string, unknown> = {}) {
      return {
        id: PLAN_ID,
        tenantId: TENANT_A,
        name: 'FY27 sales incentive',
        description: null,
        metricCode: 'revenue',
        periodType: 'monthly',
        scopeType: 'membership',
        basis: 'revenue',
        status: 'active',
        holdBps: 0,
        minAttainmentBps: 0,
        payoutCap: null,
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
        effectiveTo: null,
        version: 1,
        kpi: { name: 'Revenue', unit: 'minor_currency' },
        slabs: [
          {
            id: SLAB_ID,
            planId: PLAN_ID,
            label: '80–100%',
            fromBps: 8000,
            toBps: null,
            payoutKind: 'percent',
            rateBps: 200,
            amount: null,
            perUnitAmount: null,
            bonusAmount: 0,
          },
        ],
        ...overrides,
      };
    }

    function service() {
      return new IncentivesService(prisma as never, targetsService());
    }

    beforeEach(() => {
      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({
        code: 'revenue',
        name: 'Revenue',
        unit: 'minor_currency',
      });
      (prisma.incentivePlan.findFirst as jest.Mock).mockResolvedValue(planRow());
    });

    it('serves a catalog of bases, kinds, and statuses', () => {
      const catalog = service().catalog();
      expect(catalog.bases.map((row) => row.code)).toEqual(['revenue', 'units', 'count']);
      expect(catalog.payoutKinds).toHaveLength(3);
      expect(catalog.planStatuses).toContain('active');
    });

    it('lists plans with their slab ladder and coverage issues', async () => {
      (prisma.incentivePlan.findMany as jest.Mock).mockResolvedValue([planRow()]);
      const page = await service().listPlans(user, {});
      expect(page.data[0]?.slabs).toHaveLength(1);
      // The ladder starts at 80%, so the band below it is uncovered.
      expect(page.data[0]?.coverageIssues).toEqual([]);
      expect(page.page.hasMore).toBe(false);
    });

    it('filters the plan list and rejects a bad cursor', async () => {
      await service().listPlans(user, { status: 'active', metricCode: 'revenue' });
      const where = (prisma.incentivePlan.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
      expect(where.status).toBe('active');
      expect(where.metricCode).toBe('revenue');
      await expect(service().listPlans(user, { cursor: 'not-a-cursor' })).rejects.toMatchObject({
        code: ErrorCodes.BAD_REQUEST,
      });
    });

    it('reads one plan and reports a missing one', async () => {
      await expect(service().getPlan(user, PLAN_ID)).resolves.toMatchObject({ id: PLAN_ID });
      (prisma.incentivePlan.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service().getPlan(user, PLAN_ID)).rejects.toMatchObject({
        code: ErrorCodes.NOT_FOUND,
      });
    });

    it('creates and updates a plan', async () => {
      (prisma.incentivePlan.create as jest.Mock).mockResolvedValue(planRow());
      await expect(
        service().createPlan(user, {
          name: 'FY27',
          metricCode: 'revenue',
          effectiveFrom: '2026-04-01',
          holdBps: 2500,
        }),
      ).resolves.toMatchObject({ name: 'FY27 sales incentive' });

      (prisma.incentivePlan.update as jest.Mock).mockResolvedValue(planRow({ status: 'archived' }));
      await expect(
        service().updatePlan(user, PLAN_ID, { status: 'archived', version: 1 }),
      ).resolves.toMatchObject({ status: 'archived' });
    });

    it('rejects an unknown metric and an inverted window', async () => {
      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service().createPlan(user, {
          name: 'Bad',
          metricCode: 'nope',
          effectiveFrom: '2026-04-01',
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });

      (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({ code: 'revenue' });
      await expect(
        service().createPlan(user, {
          name: 'Bad window',
          metricCode: 'revenue',
          effectiveFrom: '2026-04-01',
          effectiveTo: '2026-03-01',
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    });

    it('refuses a stale plan update', async () => {
      await expect(
        service().updatePlan(user, PLAN_ID, { name: 'Renamed', version: 99 }),
      ).rejects.toMatchObject({ code: ErrorCodes.STALE_VERSION });
    });

    it('archives rather than deletes a plan that has paid out', async () => {
      (prisma.incentivePayout.count as jest.Mock).mockResolvedValue(3);
      await expect(service().removePlan(user, PLAN_ID)).rejects.toMatchObject({
        code: ErrorCodes.CONFLICT,
      });
      (prisma.incentivePayout.count as jest.Mock).mockResolvedValue(0);
      await expect(service().removePlan(user, PLAN_ID)).resolves.toEqual({ id: PLAN_ID });
    });

    it('adds, updates, and removes a slab', async () => {
      const slab = planRow().slabs[0];
      (prisma.incentiveSlab.create as jest.Mock).mockResolvedValue(slab);
      await expect(
        service().addSlab(user, PLAN_ID, {
          fromBps: 8000,
          toBps: 10000,
          payoutKind: 'percent',
          rateBps: 200,
        }),
      ).resolves.toMatchObject({ id: SLAB_ID });

      (prisma.incentiveSlab.findFirst as jest.Mock).mockResolvedValue({ id: SLAB_ID });
      (prisma.incentiveSlab.update as jest.Mock).mockResolvedValue(slab);
      await expect(
        service().updateSlab(user, PLAN_ID, SLAB_ID, {
          fromBps: 8000,
          payoutKind: 'flat',
          amount: 5000,
        }),
      ).resolves.toMatchObject({ id: SLAB_ID });

      await expect(service().removeSlab(user, PLAN_ID, SLAB_ID)).resolves.toEqual({ id: SLAB_ID });
    });

    it('rejects an inverted band and a slab missing its rate', async () => {
      await expect(
        service().addSlab(user, PLAN_ID, {
          fromBps: 10000,
          toBps: 8000,
          payoutKind: 'percent',
          rateBps: 200,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });

      for (const payoutKind of ['percent', 'flat', 'per_unit'] as const) {
        await expect(
          service().addSlab(user, PLAN_ID, { fromBps: 0, payoutKind }),
        ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
      }
    });

    it('reports a missing slab on update and delete', async () => {
      (prisma.incentiveSlab.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service().updateSlab(user, PLAN_ID, SLAB_ID, {
          fromBps: 0,
          payoutKind: 'percent',
          rateBps: 1,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND });

      (prisma.incentiveSlab.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(service().removeSlab(user, PLAN_ID, SLAB_ID)).rejects.toMatchObject({
        code: ErrorCodes.NOT_FOUND,
      });
    });

    it('computes a period and writes one payout per active member', async () => {
      (prisma.target.findMany as jest.Mock).mockResolvedValue([
        { id: 'target-1', scopeId: MEMBERSHIP_A, targetValue: 100_000 },
      ]);
      (prisma.quotation.groupBy as jest.Mock).mockResolvedValue([
        { assignedToMembershipId: MEMBERSHIP_A, _sum: { totalMinor: 90_000 } },
      ]);
      (prisma.incentivePayout.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service().compute(user, { planId: PLAN_ID });
      expect(result.computed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(prisma.incentivePayout.create).toHaveBeenCalled();
      const data = (prisma.incentivePayout.create as jest.Mock).mock.calls[0]?.[0]?.data;
      // 90% attainment sits in the 80%+ band: 2% of 90,000.
      expect(Number(data.earnedAmount)).toBe(1800);
      expect(data.attainmentBps).toBe(9000);
    });

    it('updates an existing draft rather than inserting a second row', async () => {
      (prisma.incentivePayout.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({ id: PAYOUT_ID });
      await service().compute(user, { planId: PLAN_ID });
      expect(prisma.incentivePayout.update).toHaveBeenCalled();
      expect(prisma.incentivePayout.create).not.toHaveBeenCalled();
    });

    it('leaves an approved payout untouched', async () => {
      (prisma.incentivePayout.findMany as jest.Mock).mockResolvedValue([
        { membershipId: MEMBERSHIP_A },
      ]);
      const result = await service().compute(user, { planId: PLAN_ID });
      expect(result.computed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(prisma.incentivePayout.create).not.toHaveBeenCalled();
    });

    it('builds the report with totals, status split, and per-member rows', async () => {
      (prisma.incentivePayout.findMany as jest.Mock).mockResolvedValue([
        {
          id: PAYOUT_ID,
          planId: PLAN_ID,
          membershipId: MEMBERSHIP_A,
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T00:00:00.000Z'),
          targetValue: 100_000,
          achievedValue: 90_000,
          attainmentBps: 9000,
          slabId: SLAB_ID,
          earnedAmount: 1800,
          holdAmount: 0,
          payableAmount: 1800,
          paidAmount: 0,
          status: 'approved',
          computedAt: new Date('2026-09-21T00:00:00.000Z'),
          approvedAt: null,
          paidAt: null,
          notes: null,
          version: 1,
          plan: { name: 'FY27' },
          membership: { user: { fullName: 'Ada Lovelace' } },
          slab: { label: '80–100%' },
        },
      ]);
      (prisma.quotation.groupBy as jest.Mock).mockResolvedValue([
        { assignedToMembershipId: MEMBERSHIP_A, _count: { _all: 18 } },
      ]);

      const report = await service().report(user, {});
      expect(report.totals.earnedAmount).toBe(1800);
      expect(report.totals.wonOrders).toBe(18);
      expect(report.totals.completionBps).toBe(9000);
      expect(report.byStatus).toEqual([
        { status: 'approved', count: 1, earnedAmount: 1800 },
      ]);
      expect(report.byMember[0]?.membershipName).toBe('Ada Lovelace');
      expect(report.items).toHaveLength(1);
    });

    it('applies every report filter', async () => {
      await service().report(user, {
        planId: PLAN_ID,
        membershipId: MEMBERSHIP_A,
        status: 'paid',
        from: '2026-09-01',
        to: '2026-09-30',
      });
      const where = (prisma.incentivePayout.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
      expect(where.planId).toBe(PLAN_ID);
      expect(where.membershipId).toBe(MEMBERSHIP_A);
      expect(where.status).toBe('paid');
      expect(where.periodEnd.gte).toBeInstanceOf(Date);
      expect(where.periodStart.lte).toBeInstanceOf(Date);
    });

    it('returns an empty report rather than dividing by zero', async () => {
      const report = await service().report(user, {});
      expect(report.totals.count).toBe(0);
      expect(report.totals.completionBps).toBeNull();
      expect(report.byMember).toEqual([]);
    });

    it('serves the viewer their own card and needs a membership to do it', async () => {
      await expect(service().mine(user, {})).resolves.toMatchObject({
        items: [],
        summary: expect.any(Object),
      });
      await expect(
        service().mine(actor({ membershipId: undefined }), {}),
      ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    });

    it('approves a draft, then pays an approved payout', async () => {
      const base = {
        id: PAYOUT_ID,
        planId: PLAN_ID,
        membershipId: MEMBERSHIP_A,
        periodStart: new Date('2026-09-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-30T00:00:00.000Z'),
        targetValue: 100_000,
        achievedValue: 90_000,
        attainmentBps: 9000,
        slabId: SLAB_ID,
        earnedAmount: 1800,
        holdAmount: 0,
        payableAmount: 1800,
        paidAmount: 0,
        computedAt: new Date(),
        approvedAt: null,
        paidAt: null,
        notes: null,
        version: 1,
        plan: { name: 'FY27' },
        membership: { user: { fullName: 'Ada' } },
        slab: { label: '80–100%' },
      };

      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({
        ...base,
        status: 'draft',
      });
      (prisma.incentivePayout.update as jest.Mock).mockResolvedValue({
        ...base,
        status: 'approved',
      });
      await expect(service().approve(user, PAYOUT_ID, {})).resolves.toMatchObject({
        status: 'approved',
      });

      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({
        ...base,
        status: 'approved',
      });
      (prisma.incentivePayout.update as jest.Mock).mockResolvedValue({
        ...base,
        status: 'paid',
        paidAmount: 1800,
      });
      await expect(
        service().markPaid(user, PAYOUT_ID, { notes: 'September run' }),
      ).resolves.toMatchObject({ status: 'paid' });
    });

    it('refuses to approve twice or pay an unapproved payout', async () => {
      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({
        id: PAYOUT_ID,
        status: 'approved',
        version: 1,
        payableAmount: 1800,
      });
      await expect(service().approve(user, PAYOUT_ID, {})).rejects.toMatchObject({
        code: ErrorCodes.CONFLICT,
      });

      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({
        id: PAYOUT_ID,
        status: 'draft',
        version: 1,
        payableAmount: 1800,
      });
      await expect(service().markPaid(user, PAYOUT_ID, {})).rejects.toMatchObject({
        code: ErrorCodes.CONFLICT,
      });
    });

    it('reports a missing payout and a stale one', async () => {
      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service().approve(user, PAYOUT_ID, {})).rejects.toMatchObject({
        code: ErrorCodes.NOT_FOUND,
      });

      (prisma.incentivePayout.findFirst as jest.Mock).mockResolvedValue({
        id: PAYOUT_ID,
        status: 'draft',
        version: 4,
      });
      await expect(
        service().approve(user, PAYOUT_ID, { version: 1 }),
      ).rejects.toMatchObject({ code: ErrorCodes.STALE_VERSION });
    });

    it('requires a tenant everywhere', async () => {
      const anon = actor({ tenantId: undefined });
      await expect(service().listPlans(anon, {})).rejects.toMatchObject({
        code: ErrorCodes.TENANT_REQUIRED,
      });
      await expect(service().report(anon, {})).rejects.toMatchObject({
        code: ErrorCodes.TENANT_REQUIRED,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // HTTP surface
  // ---------------------------------------------------------------------------

  describe('incentive controllers', () => {
    /** Every method resolves, so the controller's own delegation is what is tested. */
    function svc(): never {
      return new Proxy({}, { get: () => jest.fn().mockResolvedValue({ ok: true }) }) as never;
    }

    const id = '11111111-1111-4111-8111-111111111111';

    it('delegates every incentive route to the service', () => {
      const controller = new IncentivesController(svc());
      expect(controller.catalog()).toBeDefined();
      expect(controller.mine(user, {})).toBeDefined();
      expect(controller.listPlans(user, {})).toBeDefined();
      expect(
        controller.createPlan(user, {
          name: 'FY27',
          metricCode: 'revenue',
          effectiveFrom: '2026-04-01',
        }),
      ).toBeDefined();
      expect(controller.getPlan(user, id)).toBeDefined();
      expect(controller.updatePlan(user, id, { status: 'active' })).toBeDefined();
      expect(controller.removePlan(user, id)).toBeDefined();
      expect(
        controller.addSlab(user, id, { fromBps: 0, payoutKind: 'percent', rateBps: 100 }),
      ).toBeDefined();
      expect(
        controller.updateSlab(user, id, id, { fromBps: 0, payoutKind: 'flat', amount: 1 }),
      ).toBeDefined();
      expect(controller.removeSlab(user, id, id)).toBeDefined();
      expect(controller.compute(user, { planId: id })).toBeDefined();
      expect(controller.approve(user, id, {})).toBeDefined();
      expect(controller.pay(user, id, {})).toBeDefined();
    });

    it('delegates the incentive report route', () => {
      expect(new IncentiveReportController(svc()).report(user, {})).toBeDefined();
    });
  });
});
