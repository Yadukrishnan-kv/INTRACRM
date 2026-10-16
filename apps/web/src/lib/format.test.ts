import { describe, expect, it } from 'vitest';
import { formatBps, formatDate, formatMoney, humanize } from './format';

describe('format', () => {
  it('renders minor units as whole rupees', () => {
    expect(formatMoney(12345600)).toBe('₹1,23,456');
    expect(formatMoney(null)).toBe('—');
  });

  it('renders basis points as a percentage', () => {
    expect(formatBps(7250)).toBe('72.5%');
    expect(formatBps(10000)).toBe('100%');
    expect(formatBps(null)).toBe('—');
  });

  it('humanizes snake_case codes', () => {
    expect(humanize('site_visit')).toBe('Site visit');
    expect(humanize(null)).toBe('—');
  });

  it('keeps date-only values on their calendar day', () => {
    expect(formatDate('2026-10-20')).toBe(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(2026, 9, 20)));
    expect(formatDate(null)).toBe('—');
  });
});
