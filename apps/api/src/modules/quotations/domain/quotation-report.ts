import { QUOTATION_STATUSES, QuotationStatusCode, isPendingQuotation } from './quotation-types';

export type QuotationReportInput = {
  status: string;
  assignedToMembershipId: string | null;
  assigneeName: string | null;
  totalMinor: number;
  reminderOverdue?: boolean;
  closingSoon?: boolean;
  closingOverdue?: boolean;
  noFollowUp?: boolean;
  predictionBps?: number | null;
};

export type QuotationReportView = {
  generatedAt: string;
  totals: {
    total: number;
    draft: number;
    sent: number;
    followUp: number;
    customerDeciding: number;
    negotiation: number;
    approved: number;
    won: number;
    lost: number;
    openValueMinor: number;
    wonValueMinor: number;
    lostValueMinor: number;
    winRateBps: number | null;
    pending: number;
    pendingValueMinor: number;
    overdueReminders: number;
    closingSoon: number;
    closingOverdue: number;
    noFollowUp: number;
    averagePredictionBps: number | null;
  };
  byStatus: Array<{ status: string; count: number; valueMinor: number }>;
  byAssignee: Array<{
    membershipId: string | null;
    name: string | null;
    total: number;
    won: number;
    lost: number;
    wonValueMinor: number;
  }>;
};

const emptyCounts = (): Record<QuotationStatusCode, { count: number; valueMinor: number }> => ({
  draft: { count: 0, valueMinor: 0 },
  sent: { count: 0, valueMinor: 0 },
  follow_up: { count: 0, valueMinor: 0 },
  customer_deciding: { count: 0, valueMinor: 0 },
  negotiation: { count: 0, valueMinor: 0 },
  approved: { count: 0, valueMinor: 0 },
  won: { count: 0, valueMinor: 0 },
  lost: { count: 0, valueMinor: 0 },
});

export function summarizeQuotations(
  rows: QuotationReportInput[],
  generatedAt = new Date(),
): QuotationReportView {
  const counts = emptyCounts();
  const byAssignee = new Map<
    string,
    {
      membershipId: string | null;
      name: string | null;
      total: number;
      won: number;
      lost: number;
      wonValueMinor: number;
    }
  >();

  for (const row of rows) {
    if ((QUOTATION_STATUSES as readonly string[]).includes(row.status)) {
      const bucket = counts[row.status as QuotationStatusCode];
      bucket.count += 1;
      bucket.valueMinor += row.totalMinor;
    }
    const key = row.assignedToMembershipId ?? 'unassigned';
    const current = byAssignee.get(key) ?? {
      membershipId: row.assignedToMembershipId,
      name: row.assigneeName,
      total: 0,
      won: 0,
      lost: 0,
      wonValueMinor: 0,
    };
    current.total += 1;
    if (row.status === 'won') {
      current.won += 1;
      current.wonValueMinor += row.totalMinor;
    }
    if (row.status === 'lost') {
      current.lost += 1;
    }
    byAssignee.set(key, current);
  }

  const decided = counts.won.count + counts.lost.count;
  const openValueMinor =
    counts.draft.valueMinor +
    counts.sent.valueMinor +
    counts.follow_up.valueMinor +
    counts.customer_deciding.valueMinor +
    counts.negotiation.valueMinor +
    counts.approved.valueMinor;
  const pending =
    counts.sent.count +
    counts.follow_up.count +
    counts.customer_deciding.count +
    counts.negotiation.count +
    counts.approved.count;
  const pendingValueMinor =
    counts.sent.valueMinor +
    counts.follow_up.valueMinor +
    counts.customer_deciding.valueMinor +
    counts.negotiation.valueMinor +
    counts.approved.valueMinor;
  const overdueReminders = rows.filter((row) => row.reminderOverdue).length;
  const closingSoon = rows.filter((row) => row.closingSoon).length;
  const closingOverdue = rows.filter((row) => row.closingOverdue).length;
  const noFollowUp = rows.filter((row) => row.noFollowUp).length;
  const predictions = rows
    .filter((row) => isPendingQuotation(row.status) && row.predictionBps != null)
    .map((row) => row.predictionBps as number);
  const averagePredictionBps =
    predictions.length === 0
      ? null
      : Math.round(predictions.reduce((sum, value) => sum + value, 0) / predictions.length);

  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      total: rows.length,
      draft: counts.draft.count,
      sent: counts.sent.count,
      followUp: counts.follow_up.count,
      customerDeciding: counts.customer_deciding.count,
      negotiation: counts.negotiation.count,
      approved: counts.approved.count,
      won: counts.won.count,
      lost: counts.lost.count,
      openValueMinor,
      wonValueMinor: counts.won.valueMinor,
      lostValueMinor: counts.lost.valueMinor,
      winRateBps: decided === 0 ? null : Math.round((counts.won.count / decided) * 10000),
      pending,
      pendingValueMinor,
      overdueReminders,
      closingSoon,
      closingOverdue,
      noFollowUp,
      averagePredictionBps,
    },
    byStatus: QUOTATION_STATUSES.map((status) => ({
      status,
      count: counts[status].count,
      valueMinor: counts[status].valueMinor,
    })),
    byAssignee: [...byAssignee.values()].sort(
      (a, b) => b.wonValueMinor - a.wonValueMinor || b.total - a.total,
    ),
  };
}
