import {
  FOUNDER_KPI_CODES,
  buildSeries,
  deltaBps,
  founderKpiItems,
  isDashboardWidgetCode,
  isFounderKpiCode,
  personalKpiItems,
  trailingDays,
} from './dashboard-metrics';

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

describe('founder KPI cards', () => {
  const base = {
    followUpsDueToday: 24,
    followUpsOverdue: 3,
    billingMtdMinor: 185_000_000,
    billingPreviousMtdMinor: 148_000_000,
    salesTargetMinor: 350_000_000,
    salesAchievedMinor: 185_500_000,
    activeLeads: 142,
    activeLeadsPrevious: 130,
    pendingQuotations: 32,
    pendingQuotationValueMinor: 90_000_000,
    wonThisMonth: 12,
    wonPreviousMonth: 10,
  };

  it('emits the six tiles in display order with their formats', () => {
    const items = founderKpiItems(base);
    expect(items.map((item) => item.code)).toEqual([...FOUNDER_KPI_CODES]);
    expect(items.map((item) => item.format)).toEqual([
      'count',
      'money',
      'percent',
      'count',
      'count',
      'count',
    ]);
    expect(items.map((item) => item.value)).toEqual([24, 185_000_000, 5300, 142, 32, 12]);
  });

  it('reports target achievement in basis points', () => {
    const [, , target] = founderKpiItems(base);
    expect(target.value).toBe(5300); // 1.855Cr of 3.5Cr
    expect(target.detail).toBe('Company revenue target, month to date');
  });

  it('shows zero rather than dividing by a missing target', () => {
    const [, , target] = founderKpiItems({ ...base, salesTargetMinor: 0 });
    expect(target.value).toBe(0);
    expect(target.detail).toBe('No company revenue target this month');
  });

  it('carries a period-on-period delta where there is a base to compare with', () => {
    const items = founderKpiItems(base);
    expect(items[1].deltaBps).toBe(2500); // billing 1.48Cr → 1.85Cr
    expect(items[3].deltaBps).toBe(923);
    expect(items[5].deltaBps).toBe(2000);
    expect(items[0].deltaBps).toBeNull();
  });

  it('calls out overdue work on the follow-up tile', () => {
    expect(founderKpiItems(base)[0].detail).toBe("3 overdue alongside today's queue");
    expect(founderKpiItems({ ...base, followUpsOverdue: 0 })[0].detail).toBe('Nothing overdue');
  });

  it('reads back its own codes', () => {
    expect(isFounderKpiCode('mtd_billing')).toBe(true);
    expect(isFounderKpiCode('mrr')).toBe(false);
  });
});
