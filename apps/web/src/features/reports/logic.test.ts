import { describe, expect, it } from 'vitest';
import { P } from '../../auth/permissions';
import { exportQuery } from './api';
import { describeRange, presetRange, rangeToQuery } from './dates';
import { HUB_LINKS, HUB_PERMISSIONS, barPercent, buildReportQuery, formatMinutes, ratioBps, visibleHubLinks } from './logic';

const NOW = new Date(2026, 9, 13, 15, 30); // 13 Oct 2026, local time

describe('presetRange', () => {
  it('covers common presets', () => {
    expect(presetRange('all', NOW)).toBeNull();
    expect(presetRange('today', NOW)).toEqual({ from: '2026-10-13', to: '2026-10-13' });
    expect(presetRange('last7', NOW)).toEqual({ from: '2026-10-07', to: '2026-10-13' });
    expect(presetRange('thisMonth', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('lastMonth', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('thisQuarter', NOW)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('fills an open custom end and ignores malformed dates', () => {
    expect(presetRange('custom', NOW, { from: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-13' });
    expect(presetRange('custom', NOW, { from: '2026-02-30' })).toBeNull();
  });
});

describe('rangeToQuery', () => {
  it('keeps calendar dates for ymd endpoints', () => {
    expect(rangeToQuery({ from: '2026-10-01', to: '2026-10-31' }, 'ymd')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('makes `to` exclusive for instant endpoints', () => {
    const q = rangeToQuery({ from: '2026-10-01', to: '2026-10-01' }, 'instant');
    expect(new Date(q.to!).getTime() - new Date(q.from!).getTime()).toBe(24 * 3600 * 1000);
  });

  it('describes ranges', () => {
    expect(describeRange(null)).toBe('All time');
    expect(describeRange({ from: '2026-10-01', to: '2026-10-01' })).toBe('2026-10-01');
  });
});

describe('buildReportQuery', () => {
  it('defaults to all time with no params', () => {
    const s = buildReportQuery(new URLSearchParams(), 'instant', ['ownerMembershipId'], NOW);
    expect(s.preset).toBe('all');
    expect(s.query).toEqual({});
    expect(s.extras).toEqual({ ownerMembershipId: '' });
  });

  it('maps preset, custom dates and extra filters into the API query', () => {
    const params = new URLSearchParams('range=custom&start=2026-10-01&end=2026-10-05&membershipId=abc&junk=1');
    const s = buildReportQuery(params, 'ymd', ['membershipId'], NOW);
    expect(s.query).toEqual({ from: '2026-10-01', to: '2026-10-05', membershipId: 'abc' });
  });

  it('falls back to the default preset when the param is unknown', () => {
    const s = buildReportQuery(new URLSearchParams('range=bogus'), 'ymd', [], NOW, 'thisMonth');
    expect(s.preset).toBe('thisMonth');
    expect(s.query).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('exportQuery', () => {
  it('passes only export-supported params', () => {
    expect(exportQuery({ from: 'a', to: 'b', ownerMembershipId: 'x', periodType: 'daily' }, 'csv')).toEqual({
      format: 'csv',
      from: 'a',
      to: 'b',
      periodType: 'daily',
    });
  });
});

describe('hub links', () => {
  it('filters by permission', () => {
    const held = new Set<string>([P.leadRead]);
    const links = visibleHubLinks((anyOf) => anyOf.some((p) => held.has(p)));
    expect(links.map((l) => l.to)).toEqual(['/reports/leads', '/reports/pipeline']);
  });

  it('gates the hub on every card permission', () => {
    for (const link of HUB_LINKS) for (const p of link.anyOf) expect(HUB_PERMISSIONS).toContain(p);
  });
});

describe('formatters', () => {
  it('bar percent clamps', () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(15, 10)).toBe(100);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(-1, 10)).toBe(0);
  });

  it('formats minutes and ratios', () => {
    expect(formatMinutes(125)).toBe('2h 05m');
    expect(formatMinutes(42)).toBe('42m');
    expect(ratioBps(1, 4)).toBe(2500);
    expect(ratioBps(1, 0)).toBeNull();
  });
});
