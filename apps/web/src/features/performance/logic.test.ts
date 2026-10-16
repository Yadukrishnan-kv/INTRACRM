import { describe, expect, it } from 'vitest';
import {
  boardDelta,
  boardValue,
  buildTargetBody,
  dayLabel,
  deltaLabel,
  kpiTone,
  metricDisplay,
  orderedWidgets,
  pct,
  podiumOrder,
  rupeesShort,
  shiftPeriodStart,
  signedBalance,
  targetFilterQuery,
  targetTitle,
  workingDaysBetween,
  type TargetFormValues,
} from './logic';
import type { DashboardWidget } from './types';

const widget = (code: string): DashboardWidget => ({
  code,
  title: code,
  primary: 0,
  primaryLabel: '',
  previous: 0,
  deltaBps: null,
  month: 0,
  metrics: [],
  series: [],
  mix: [],
});

describe('number formatting', () => {
  it('short rupees in lakh/crore', () => {
    expect(rupeesShort(12_00_00_000_00)).toBe('₹12Cr');
    expect(rupeesShort(18_50_000_00)).toBe('₹18.5L');
    expect(rupeesShort(15_00_000_00)).toBe('₹15L');
    expect(rupeesShort(5000_00)).toBe('₹5K');
    expect(rupeesShort(999_00)).toBe('₹999');
  });

  it('board values and deltas', () => {
    expect(boardValue(12.5, false)).toBe('12.5');
    expect(boardValue(12, false)).toBe('12');
    expect(boardDelta(-4_20_000_00, true)).toBe('-₹4.2L');
    expect(boardDelta(10_000_00, true)).toBe('+₹10K');
  });

  it('percent and deltas from bps', () => {
    expect(pct(7250)).toBe('73%');
    expect(pct(null)).toBe('—');
    expect(deltaLabel(1250)).toBe('+13%');
    expect(deltaLabel(-300)).toBe('-3%');
    expect(deltaLabel(0)).toBe('0%');
    expect(deltaLabel(null)).toBe('—');
  });

  it('kpi tone thresholds', () => {
    expect(kpiTone(7000)).toBe('success');
    expect(kpiTone(4000)).toBe('warning');
    expect(kpiTone(100)).toBe('danger');
    expect(kpiTone(null)).toBe('neutral');
  });
});

describe('dashboard widgets', () => {
  it('orders by code list and skips missing', () => {
    const list = orderedWidgets({ sales: widget('sales'), leads: widget('leads') }, ['leads', 'follow_ups', 'sales']);
    expect(list.map((w) => w.code)).toEqual(['leads', 'sales']);
  });

  it('metric display follows the widget kind', () => {
    expect(metricDisplay(widget('leads'), { code: 'rate_bps', label: '', value: 5000 })).toBe('50%');
    expect(metricDisplay(widget('leads'), { code: 'open', label: '', value: 5 })).toBe('5');
    expect(metricDisplay(widget('sales'), { code: 'achievement_bps', label: '', value: 5000 })).toBe('50%');
    expect(metricDisplay(widget('sales'), { code: 'target', label: '', value: 100 })).toContain('1');
  });

  it('working days skip Sundays', () => {
    // October 2026 has 4 Sundays.
    expect(workingDaysBetween('2026-10-01', '2026-10-31')).toBe(27);
    expect(workingDaysBetween('bad', '2026-10-31')).toBeNull();
  });

  it('day labels', () => {
    expect(dayLabel('2026-10-03')).toBe('03 Oct');
  });
});

describe('targets', () => {
  const base: TargetFormValues = {
    kind: 'monthly',
    scopeType: 'tenant',
    metricCode: 'revenue',
    value: '1500',
    anchor: '2026-10-13',
    teamId: '',
    staffId: '',
    productId: '',
    notes: '',
  };
  const money = { code: 'revenue', unit: 'minor_currency' };

  it('builds a company monthly revenue target in paise', () => {
    expect(buildTargetBody(base, money)).toEqual({
      body: { periodType: 'monthly', scopeType: 'tenant', metricCode: 'revenue', targetValue: 150000, periodStart: '2026-10-13' },
    });
  });

  it('team kind forces team scope and needs a team', () => {
    expect(buildTargetBody({ ...base, kind: 'team' }, money)).toEqual({ error: 'Select a team.' });
    const r = buildTargetBody({ ...base, kind: 'team', teamId: 't1' }, money);
    expect('body' in r && r.body).toMatchObject({ scopeType: 'team', scopeId: 't1' });
  });

  it('staff scope and product kind are checked', () => {
    expect(buildTargetBody({ ...base, scopeType: 'membership' }, money)).toEqual({ error: 'Select a staff member.' });
    expect(buildTargetBody({ ...base, kind: 'product' }, { code: 'units_sold', unit: 'count' })).toEqual({ error: 'Select a product.' });
    expect(buildTargetBody({ ...base, value: '' }, money)).toEqual({ error: 'Metric and a target value are required.' });
    const daily = buildTargetBody({ ...base, kind: 'daily', value: '3', notes: ' hi ' }, { code: 'units_sold', unit: 'count' });
    expect('body' in daily && daily.body).toMatchObject({ periodType: 'daily', targetValue: 3, notes: 'hi' });
  });

  it('filters map onto list queries', () => {
    expect(targetFilterQuery('product')).toEqual({ hasProduct: true });
    expect(targetFilterQuery('team')).toEqual({ scopeType: 'team' });
    expect(targetFilterQuery('daily')).toEqual({ periodType: 'daily' });
    expect(targetFilterQuery('')).toEqual({});
  });

  it('title and balance', () => {
    expect(targetTitle({ productName: 'Panel', metricName: 'Units', scopeName: null, scopeType: 'tenant' })).toBe('Panel · Units');
    expect(targetTitle({ productName: null, metricName: 'Revenue', scopeName: null, scopeType: 'tenant' })).toBe('Revenue · Company');
    expect(signedBalance({ balance: null, remaining: 5 })).toBe(5);
    expect(signedBalance({ balance: -2, remaining: 0 })).toBe(-2);
  });
});

describe('boards', () => {
  it('podium puts first in the middle', () => {
    expect(podiumOrder([{ rank: 1 }, { rank: 2 }, { rank: 3 }]).map((e) => e.rank)).toEqual([2, 1, 3]);
    expect(podiumOrder([{ rank: 1 }]).map((e) => e.rank)).toEqual([1]);
  });

  it('period navigation', () => {
    expect(shiftPeriodStart('monthly', '2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftPeriodStart('monthly', '2026-10-15', 1)).toBe('2026-11-01');
    expect(shiftPeriodStart('daily', '2026-03-01', -1)).toBe('2026-02-28');
  });
});
