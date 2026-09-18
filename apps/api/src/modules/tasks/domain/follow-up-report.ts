import { FOLLOW_UP_STATUSES, FOLLOW_UP_TYPES, FollowUpStatusCode } from './follow-up-types';
import { classifyFollowUpBucket } from './follow-up-engine';

export type FollowUpReportInput = {
  status: string;
  type: string;
  assignedToMembershipId: string;
  assigneeName: string | null;
  dueAt: Date;
  rescheduleCount: number;
};

export type FollowUpReportView = {
  generatedAt: string;
  totals: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    skipped: number;
    overdue: number;
    today: number;
    upcoming: number;
    rescheduled: number;
    completionRateBps: number | null;
  };
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number; completed: number }>;
  byAssignee: Array<{
    membershipId: string;
    name: string | null;
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  }>;
};

export function summarizeFollowUps(
  rows: FollowUpReportInput[],
  input: { now: Date; timeZone: string; generatedAt?: Date },
): FollowUpReportView {
  const statusCounts: Record<FollowUpStatusCode, number> = {
    pending: 0,
    completed: 0,
    cancelled: 0,
    skipped: 0,
  };
  const byType = new Map<string, { type: string; count: number; completed: number }>();
  const byAssignee = new Map<
    string,
    {
      membershipId: string;
      name: string | null;
      total: number;
      pending: number;
      completed: number;
      overdue: number;
    }
  >();
  let overdue = 0;
  let today = 0;
  let upcoming = 0;
  let rescheduled = 0;

  for (const row of rows) {
    if ((FOLLOW_UP_STATUSES as readonly string[]).includes(row.status)) {
      statusCounts[row.status as FollowUpStatusCode] += 1;
    }
    const typeKey = row.type;
    const type = byType.get(typeKey) ?? { type: typeKey, count: 0, completed: 0 };
    type.count += 1;
    if (row.status === 'completed') {
      type.completed += 1;
    }
    byType.set(typeKey, type);

    const assignee = byAssignee.get(row.assignedToMembershipId) ?? {
      membershipId: row.assignedToMembershipId,
      name: row.assigneeName,
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0,
    };
    assignee.total += 1;
    if (row.status === 'pending') {
      assignee.pending += 1;
    }
    if (row.status === 'completed') {
      assignee.completed += 1;
    }
    const bucket = classifyFollowUpBucket({
      status: row.status,
      dueAt: row.dueAt,
      now: input.now,
      timeZone: input.timeZone,
    });
    if (bucket === 'overdue') {
      overdue += 1;
      assignee.overdue += 1;
    }
    if (bucket === 'today') {
      today += 1;
    }
    if (bucket === 'upcoming') {
      upcoming += 1;
    }
    byAssignee.set(row.assignedToMembershipId, assignee);
    if (row.rescheduleCount > 0) {
      rescheduled += 1;
    }
  }

  const completable = statusCounts.completed + statusCounts.pending;
  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    totals: {
      total: rows.length,
      pending: statusCounts.pending,
      completed: statusCounts.completed,
      cancelled: statusCounts.cancelled,
      skipped: statusCounts.skipped,
      overdue,
      today,
      upcoming,
      rescheduled,
      completionRateBps:
        completable === 0 ? null : Math.round((statusCounts.completed / completable) * 10000),
    },
    byStatus: FOLLOW_UP_STATUSES.map((status) => ({ status, count: statusCounts[status] })),
    byType: FOLLOW_UP_TYPES.map((type) => byType.get(type) ?? { type, count: 0, completed: 0 }),
    byAssignee: [...byAssignee.values()].sort(
      (a, b) => b.completed - a.completed || b.total - a.total,
    ),
  };
}
