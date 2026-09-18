import { summarizeLeads } from './lead-report';

describe('lead report', () => {
  it('summarizes lifecycle, source, and owner mix', () => {
    const report = summarizeLeads([
      {
        lifecycleStatus: 'open',
        quality: 'hot',
        sourceId: 's1',
        sourceName: 'Website',
        ownerMembershipId: 'm1',
        ownerName: 'Asha',
        stageName: 'New',
        city: 'Pune',
        estimatedValueMinor: 10000,
      },
      {
        lifecycleStatus: 'won',
        quality: 'warm',
        sourceId: 's1',
        sourceName: 'Website',
        ownerMembershipId: 'm1',
        ownerName: 'Asha',
        stageName: 'Won',
        city: 'Pune',
        estimatedValueMinor: 25000,
      },
      {
        lifecycleStatus: 'lost',
        quality: 'cold',
        sourceId: null,
        sourceName: null,
        ownerMembershipId: null,
        ownerName: null,
        stageName: 'Lost',
        city: null,
        estimatedValueMinor: 5000,
      },
    ]);

    expect(report.totals.total).toBe(3);
    expect(report.totals.open).toBe(1);
    expect(report.totals.won).toBe(1);
    expect(report.totals.lost).toBe(1);
    expect(report.totals.unassigned).toBe(1);
    expect(report.totals.wonValueMinor).toBe(25000);
    expect(report.totals.winRateBps).toBe(5000);
    expect(report.bySource[0]?.name).toBe('Website');
    expect(report.byOwner[0]?.name).toBe('Asha');
    expect(report.byCity[0]).toEqual({ city: 'Pune', count: 2 });
  });
});
