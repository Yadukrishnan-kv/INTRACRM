import {
  addDaysYmd,
  computeAchievement,
  daysInclusive,
  monthBoundsFromYmd,
  periodLabel,
  quarterBoundsFromYmd,
  resolvePeriod,
  yearBoundsFromYmd,
} from './target-period';
import { summarizeTargets } from './target-report';

describe('target periods', () => {
  const tz = 'Asia/Kolkata';
  const now = new Date('2026-08-16T10:00:00.000Z');

  it('snaps monthly, daily, quarter, and year bounds', () => {
    expect(monthBoundsFromYmd('2026-08-16')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(quarterBoundsFromYmd('2026-08-16')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(yearBoundsFromYmd('2026-08-16')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(resolvePeriod({ periodType: 'daily', now, timeZone: tz })).toEqual({
      start: '2026-08-16',
      end: '2026-08-16',
    });
    expect(resolvePeriod({ periodType: 'monthly', now, timeZone: tz })).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
    expect(addDaysYmd('2026-08-31', 1)).toBe('2026-09-01');
    expect(daysInclusive('2026-08-01', '2026-08-31')).toBe(31);
    expect(periodLabel('monthly', '2026-08-01', '2026-08-31')).toBe('Aug 2026');
  });
});

describe('target achievement', () => {
  it('computes achievement %, balance, daily requirement, and forecast', () => {
    const mid = computeAchievement({
      achievedValue: 50,
      targetValue: 100,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      today: '2026-08-16',
    });
    expect(mid.daysTotal).toBe(31);
    expect(mid.daysElapsed).toBe(16);
    expect(mid.daysRemaining).toBe(16);
    expect(mid.achievementBps).toBe(5000);
    expect(mid.balance).toBe(50);
    expect(mid.remaining).toBe(50);
    expect(mid.dailyRequired).toBe(3.125);
    expect(mid.plannedDaily).toBeCloseTo(3.2258, 3);
    expect(mid.forecastValue).toBe(96.875);
    expect(mid.forecastBps).toBe(9688);
    expect(mid.forecastBand).toBe('on_track');
    expect(mid.onTrack).toBe(true);

    const behind = computeAchievement({
      achievedValue: 10,
      targetValue: 100,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      today: '2026-08-16',
    });
    expect(behind.achievementBps).toBe(1000);
    expect(behind.balance).toBe(90);
    expect(behind.dailyRequired).toBe(5.625);
    expect(behind.forecastValue).toBe(19.375);
    expect(behind.forecastBand).toBe('behind');
    expect(behind.onTrack).toBe(false);
  });

  it('allows over-achievement, surplus balance, and hit/missed close-out', () => {
    const hit = computeAchievement({
      achievedValue: 120,
      targetValue: 100,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      today: '2026-08-16',
    });
    expect(hit.achievementBps).toBe(12000);
    expect(hit.balance).toBe(-20);
    expect(hit.remaining).toBe(0);
    expect(hit.dailyRequired).toBe(0);
    expect(hit.forecastBand).toBe('hit');

    const missed = computeAchievement({
      achievedValue: 80,
      targetValue: 100,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      today: '2026-09-01',
    });
    expect(missed.daysRemaining).toBe(0);
    expect(missed.dailyRequired).toBeNull();
    expect(missed.forecastValue).toBe(80);
    expect(missed.forecastBand).toBe('missed');
    expect(missed.onTrack).toBe(false);

    const notStarted = computeAchievement({
      achievedValue: 0,
      targetValue: 100,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      today: '2026-07-31',
    });
    expect(notStarted.forecastValue).toBeNull();
    expect(notStarted.dailyRequired).toBeCloseTo(3.2258, 3);
    expect(notStarted.forecastBand).toBe('not_started');
    expect(notStarted.onTrack).toBe(true);
  });

  it('treats a one-day target as today remaining', () => {
    const day = computeAchievement({
      achievedValue: 2,
      targetValue: 5,
      periodStart: '2026-08-16',
      periodEnd: '2026-08-16',
      today: '2026-08-16',
    });
    expect(day.daysTotal).toBe(1);
    expect(day.daysRemaining).toBe(1);
    expect(day.dailyRequired).toBe(3);
    expect(day.forecastValue).toBe(2);
    expect(day.forecastBand).toBe('behind');
  });
});

describe('target report', () => {
  it('splits monthly, daily, team, and product targets', () => {
    const report = summarizeTargets(
      [
        {
          periodType: 'monthly',
          scopeType: 'team',
          productId: null,
          metricCode: 'revenue',
          metricName: 'Revenue',
          targetValue: 100000,
          achievedValue: 80000,
          achievementBps: 8000,
          attainmentBps: 8000,
          balance: 20000,
          dailyRequired: 1250,
          forecastValue: 90000,
          forecastBps: 9000,
          forecastBand: 'at_risk',
          onTrack: true,
          scopeName: 'East',
          productName: null,
        },
        {
          periodType: 'daily',
          scopeType: 'tenant',
          productId: null,
          metricCode: 'leads_created',
          metricName: 'Leads created',
          targetValue: 5,
          achievedValue: 1,
          achievementBps: 2000,
          attainmentBps: 2000,
          balance: 4,
          dailyRequired: 4,
          forecastValue: 1,
          forecastBps: 2000,
          forecastBand: 'behind',
          onTrack: false,
          scopeName: 'Company',
          productName: null,
        },
        {
          periodType: 'monthly',
          scopeType: 'tenant',
          productId: 'p1',
          metricCode: 'units_sold',
          metricName: 'Units sold',
          targetValue: 20,
          achievedValue: 4,
          achievementBps: 2000,
          attainmentBps: 2000,
          balance: 16,
          dailyRequired: 1,
          forecastValue: 8,
          forecastBps: 4000,
          forecastBand: 'behind',
          onTrack: false,
          scopeName: 'Company',
          productName: 'Inverter',
        },
      ],
      new Date('2026-08-16T12:00:00.000Z'),
    );
    expect(report.totals.count).toBe(3);
    expect(report.totals.onTrack).toBe(1);
    expect(report.totals.behind).toBe(2);
    expect(report.totals.balance).toBe(20020);
    expect(report.byForecast.some((row) => row.band === 'behind' && row.count === 2)).toBe(true);
    expect(report.products).toHaveLength(1);
    expect(report.teams[0]?.scopeName).toBe('East');
  });
});
