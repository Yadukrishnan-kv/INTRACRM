import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { actor, TENANT_A } from '../testing/fixtures';
import { createPrismaMock, PrismaMock } from '../testing/prisma-mock';
import { AnalyticsService } from './analytics/application/analytics.service';
import { AnalyticsRangeQuery } from './analytics/interface/http/dto/analytics.dto';
import { PerformanceService } from './performance/application/performance.service';
import {
  PerformanceBoardQuery,
  PerformanceReportQuery,
} from './performance/interface/http/dto/performance.dto';
import { ReportExportService } from './reporting/application/report-export.service';
import { periodRangeUtc, resolveReportRange } from './targets/domain/target-period';

const TZ = 'Asia/Kolkata';

async function errorsFor<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('resolveReportRange', () => {
  it('returns null when no bound is given', () => {
    expect(resolveReportRange({ todayYmd: '2026-08-17' })).toBeNull();
  });

  it('keeps an explicit inclusive range and fills missing bounds', () => {
    expect(resolveReportRange({ from: '2026-08-01', to: '2026-08-10', todayYmd: '2026-08-17' })).toEqual({
      start: '2026-08-01',
      end: '2026-08-10',
    });
    expect(resolveReportRange({ from: '2026-08-05', todayYmd: '2026-08-17' })).toEqual({
      start: '2026-08-05',
      end: '2026-08-17',
    });
    expect(resolveReportRange({ to: '2026-07-20', todayYmd: '2026-08-17' })).toEqual({
      start: '2026-07-01',
      end: '2026-07-20',
    });
  });

  it('rejects inverted and over-long ranges', () => {
    expect(() => resolveReportRange({ from: '2026-08-10', to: '2026-08-01', todayYmd: '2026-08-17' })).toThrow(
      'to must be on or after from',
    );
    expect(() => resolveReportRange({ from: '2025-01-01', to: '2026-08-01', todayYmd: '2026-08-17' })).toThrow(
      /cannot exceed 366 days/,
    );
    expect(resolveReportRange({ from: '2025-08-01', to: '2026-07-31', todayYmd: '2026-08-17' })).toEqual({
      start: '2025-08-01',
      end: '2026-07-31',
    });
  });
});

describe('date-range query DTOs', () => {
  it.each([AnalyticsRangeQuery, PerformanceReportQuery, PerformanceBoardQuery])(
    '%p accepts YYYY-MM-DD from/to and rejects other formats',
    async (cls) => {
      await expect(errorsFor(cls as never, { from: '2026-08-01', to: '2026-08-31' })).resolves.toEqual([]);
      await expect(errorsFor(cls as never, { from: '2026-08-01T00:00:00Z' })).resolves.toEqual(['from']);
      await expect(errorsFor(cls as never, { to: '31/08/2026' })).resolves.toEqual(['to']);
    },
  );
});

describe('analytics date range', () => {
  let prisma: PrismaMock;
  let analytics: AnalyticsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ id: TENANT_A, timezone: TZ });
    analytics = new AnalyticsService(prisma as never);
  });

  it('keeps the current-month window when no range is given', async () => {
    const board = await analytics.overview(actor());
    expect(board.range).toBeNull();
    expect(board.month.start.slice(8)).toBe('01');
    expect(board.widgets.leads.metrics.find((row) => row.code === 'month')?.label).toBe('This month');
  });

  it('uses from/to as the summary window in place of the month', async () => {
    const board = await analytics.overview(actor(), undefined, { from: '2026-05-01', to: '2026-05-15' });
    const window = periodRangeUtc('2026-05-01', '2026-05-15', TZ);
    expect(board.range).toEqual({ from: '2026-05-01', to: '2026-05-15' });
    expect(board.month).toMatchObject({ start: '2026-05-01', end: '2026-05-15', label: '2026-05-01 – 2026-05-15' });
    expect(board.widgets.leads.metrics.find((row) => row.code === 'month')?.label).toBe('Selected range');
    const where = (prisma.lead.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
    expect(where.createdAt.gte.getTime()).toBeLessThanOrEqual(window.from.getTime());
    expect(where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(window.toExclusive.getTime());
  });

  it('extends the query window when the range ends after today', async () => {
    const future = periodRangeUtc('2099-01-01', '2099-01-31', TZ);
    await analytics.overview(actor(), undefined, { from: '2099-01-01', to: '2099-01-31' });
    const where = (prisma.lead.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
    expect(where.createdAt.lt).toEqual(future.toExclusive);
  });

  it('rejects an inverted range with 400', async () => {
    await expect(
      analytics.report(actor(), undefined, { from: '2026-05-15', to: '2026-05-01' }),
    ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    await expect(
      analytics.funnelReport(actor(), undefined, { from: '2024-01-01', to: '2026-05-01' }),
    ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
  });

  it('passes the range through mine, widget and mineFunnel', async () => {
    const range = { from: '2026-05-01', to: '2026-05-03' };
    await expect(analytics.mine(actor(), range)).resolves.toMatchObject({ range: { from: '2026-05-01' } });
    await expect(analytics.widget(actor(), 'leads', range)).resolves.toMatchObject({
      range: { to: '2026-05-03' },
    });
    await expect(analytics.mineFunnel(actor(), range)).resolves.toMatchObject({ range: { from: '2026-05-01' } });
  });

  it('builds the funnel over the cohort of leads created in the range', async () => {
    const window = periodRangeUtc('2026-05-01', '2026-05-10', TZ);
    const report = await analytics.funnelReport(actor(), undefined, { from: '2026-05-01', to: '2026-05-10' });
    expect(report.range).toEqual({ from: '2026-05-01', to: '2026-05-10' });
    expect(report.charts.trend.map((point) => point.date)).toHaveLength(10);
    expect(report.charts.trend[0]?.date).toBe('2026-05-01');
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: window.from, lt: window.toExclusive },
        }),
      }),
    );
    expect(prisma.leadStageChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_A,
          lead: { deletedAt: null, createdAt: { gte: window.from, lt: window.toExclusive } },
          changedAt: { lt: window.toExclusive },
        },
      }),
    );
  });

  it('keeps the all-leads funnel with a 7-day trend by default', async () => {
    const report = await analytics.funnelReport(actor());
    expect(report.range).toBeNull();
    expect(report.charts.trend).toHaveLength(7);
    const where = (prisma.lead.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
    expect(where.createdAt).toBeUndefined();
  });
});

describe('performance date range', () => {
  let prisma: PrismaMock;
  let performance: PerformanceService;

  beforeEach(() => {
    prisma = createPrismaMock();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ id: TENANT_A, timezone: TZ });
    performance = new PerformanceService(prisma as never);
  });

  it('treats from/to as a custom period that overrides periodType', async () => {
    const window = periodRangeUtc('2026-05-01', '2026-05-20', TZ);
    const view = await performance.report(actor(), {
      periodType: 'yearly',
      from: '2026-05-01',
      to: '2026-05-20',
    });
    expect(view.period).toMatchObject({ type: 'custom', start: '2026-05-01', end: '2026-05-20' });
    expect(prisma.lead.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gte: window.from, lt: window.toExclusive } }),
      }),
    );
  });

  it('applies the range to the leaderboard and keeps periodType when no range is given', async () => {
    await expect(performance.board(actor(), { from: '2026-05-01', to: '2026-05-02' })).resolves.toMatchObject({
      period: { type: 'custom', start: '2026-05-01', end: '2026-05-02' },
    });
    await expect(performance.report(actor(), { periodType: 'monthly', periodStart: '2026-05-10' })).resolves.toMatchObject({
      period: { type: 'monthly', start: '2026-05-01', end: '2026-05-31' },
    });
  });

  it('rejects an inverted range with 400', async () => {
    await expect(
      performance.report(actor(), { from: '2026-05-20', to: '2026-05-01' }),
    ).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
  });
});

describe('report exports forward the date range', () => {
  function build() {
    const stop = new Error('stop');
    const performance = { report: jest.fn().mockRejectedValue(stop) };
    const analytics = {
      report: jest.fn().mockRejectedValue(stop),
      funnelReport: jest.fn().mockRejectedValue(stop),
    };
    const service = new ReportExportService(
      {} as never,
      {} as never,
      {} as never,
      performance as never,
      analytics as never,
      {} as never,
    );
    return { service, performance, analytics };
  }

  it('passes inclusive calendar days to performance, analytics and funnel', async () => {
    const { service, performance, analytics } = build();
    const query = { format: 'csv' as const, from: '2026-05-01', to: '2026-05-31T00:00:00.000Z' };
    await expect(service.build(actor(), 'performance', query)).rejects.toThrow('stop');
    await expect(service.build(actor(), 'analytics', query)).rejects.toThrow('stop');
    await expect(service.build(actor(), 'funnel', query)).rejects.toThrow('stop');
    expect(performance.report).toHaveBeenCalledWith(actor(), { from: '2026-05-01', to: '2026-05-31' });
    expect(analytics.report).toHaveBeenCalledWith(actor(), undefined, { from: '2026-05-01', to: '2026-05-31' });
    expect(analytics.funnelReport).toHaveBeenCalledWith(actor(), undefined, {
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });
});
