import { buildSeries, deltaBps, isDashboardWidgetCode, personalKpiItems, trailingDays } from './dashboard-metrics';

describe('founder dashboard metrics', () => {
  it('computes period deltas in basis points', () => {
    expect(deltaBps(12, 10)).toBe(2000);
    expect(deltaBps(8, 10)).toBe(-2000);
    expect(deltaBps(0, 0)).toBe(0);
    expect(deltaBps(5, 0)).toBeNull();
  });

  it('builds a trailing day window and buckets values by tenant zone', () => {
    expect(trailingDays('2026-08-16', 3)).toEqual(['2026-08-14', '2026-08-15', '2026-08-16']);
    const series = buildSeries(
      ['2026-08-16', '2026-08-17'],
      [
        { at: new Date('2026-08-16T10:00:00.000Z'), value: 2 },
        { at: new Date('2026-08-16T20:00:00.000Z'), value: 3 },
      ],
      'Asia/Kolkata',
    );
    expect(series.map((point) => point.value)).toEqual([2, 3]);
  });

  it('accepts only known widget codes', () => {
    expect(isDashboardWidgetCode('leads')).toBe(true);
    expect(isDashboardWidgetCode('orders')).toBe(true);
    expect(isDashboardWidgetCode('unknown')).toBe(false);
  });

  it('builds personal KPI rows from live counts', () => {
    const items = personalKpiItems({
      leadsCreated: 8,
      leadsWon: 2,
      leadsLost: 2,
      followUpsDue: 4,
      followUpsCompleted: 3,
      quotationsSent: 5,
      quotationsWon: 1,
      quotationsLost: 1,
      revenueMinor: 50000,
      salesTargetMinor: 100000,
      leadConversionBps: 5000,
      followUpCompletionBps: 7500,
      salesAchievementBps: 5000,
      quotationConversionBps: 5000,
    });
    expect(items.map((item) => item.code)).toEqual([
      'lead_conversion',
      'follow_up_completion',
      'sales_achievement',
      'quotation_conversion',
    ]);
    expect(items[0]?.detail).toContain('2 won');
    expect(items[2]?.detail).toContain('₹500 of ₹1000');
  });
});
