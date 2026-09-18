import { summarizeSales } from './sales-report';

describe('sales report', () => {
  it('counts won revenue and win rate from closed quotations', () => {
    const report = summarizeSales([
      {
        status: 'won',
        assignedToMembershipId: 'm1',
        assigneeName: 'Asha',
        totalMinor: 50000,
        month: '2026-08',
      },
      {
        status: 'won',
        assignedToMembershipId: 'm1',
        assigneeName: 'Asha',
        totalMinor: 25000,
        month: '2026-07',
      },
      {
        status: 'lost',
        assignedToMembershipId: 'm2',
        assigneeName: 'Ravi',
        totalMinor: 10000,
        month: null,
      },
    ]);

    expect(report.totals.deals).toBe(2);
    expect(report.totals.revenueMinor).toBe(75000);
    expect(report.totals.averageDealMinor).toBe(37500);
    expect(report.totals.lostDeals).toBe(1);
    expect(report.totals.winRateBps).toBe(6667);
    expect(report.byAssignee[0]?.name).toBe('Asha');
    expect(report.byMonth.map((row) => row.month)).toEqual(['2026-07', '2026-08']);
  });
});
