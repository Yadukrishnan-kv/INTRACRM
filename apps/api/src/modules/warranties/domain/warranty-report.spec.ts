import { summarizeWarranties } from './warranty-report';

describe('warranty report', () => {
  it('counts live expired separately from stored active', () => {
    const report = summarizeWarranties([
      { storedStatus: 'active', effectiveStatus: 'active' },
      { storedStatus: 'active', effectiveStatus: 'expired' },
      { storedStatus: 'claimed', effectiveStatus: 'claimed' },
    ]);
    expect(report.totals.total).toBe(3);
    expect(report.totals.active).toBe(1);
    expect(report.totals.expired).toBe(1);
    expect(report.totals.claimed).toBe(1);
  });
});
