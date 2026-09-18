export type SalesReportInput = {
  status: string;
  assignedToMembershipId: string | null;
  assigneeName: string | null;
  totalMinor: number;
  month: string | null;
};

export type SalesReportView = {
  generatedAt: string;
  totals: {
    deals: number;
    revenueMinor: number;
    averageDealMinor: number | null;
    lostDeals: number;
    lostValueMinor: number;
    closedDeals: number;
    winRateBps: number | null;
  };
  byAssignee: Array<{
    membershipId: string | null;
    name: string | null;
    deals: number;
    revenueMinor: number;
    lostDeals: number;
  }>;
  byMonth: Array<{ month: string; deals: number; revenueMinor: number }>;
};

export function summarizeSales(rows: SalesReportInput[], generatedAt = new Date()): SalesReportView {
  let deals = 0;
  let revenueMinor = 0;
  let lostDeals = 0;
  let lostValueMinor = 0;
  const byAssignee = new Map<
    string,
    {
      membershipId: string | null;
      name: string | null;
      deals: number;
      revenueMinor: number;
      lostDeals: number;
    }
  >();
  const byMonth = new Map<string, { month: string; deals: number; revenueMinor: number }>();

  for (const row of rows) {
    const key = row.assignedToMembershipId ?? 'unassigned';
    const assignee = byAssignee.get(key) ?? {
      membershipId: row.assignedToMembershipId,
      name: row.assigneeName,
      deals: 0,
      revenueMinor: 0,
      lostDeals: 0,
    };
    if (row.status === 'won') {
      deals += 1;
      revenueMinor += row.totalMinor;
      assignee.deals += 1;
      assignee.revenueMinor += row.totalMinor;
      if (row.month) {
        const month = byMonth.get(row.month) ?? { month: row.month, deals: 0, revenueMinor: 0 };
        month.deals += 1;
        month.revenueMinor += row.totalMinor;
        byMonth.set(row.month, month);
      }
    }
    if (row.status === 'lost') {
      lostDeals += 1;
      lostValueMinor += row.totalMinor;
      assignee.lostDeals += 1;
    }
    byAssignee.set(key, assignee);
  }

  const closedDeals = deals + lostDeals;
  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      deals,
      revenueMinor,
      averageDealMinor: deals === 0 ? null : Math.round(revenueMinor / deals),
      lostDeals,
      lostValueMinor,
      closedDeals,
      winRateBps: closedDeals === 0 ? null : Math.round((deals / closedDeals) * 10000),
    },
    byAssignee: [...byAssignee.values()].sort((a, b) => b.revenueMinor - a.revenueMinor),
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
