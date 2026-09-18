import { summarizeFollowUps } from './follow-up-report';

describe('follow-up report', () => {
  it('counts status, buckets, and completion rate', () => {
    const now = new Date('2026-08-16T10:00:00.000Z');
    const report = summarizeFollowUps(
      [
        {
          status: 'pending',
          type: 'call',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          dueAt: new Date('2026-08-15T09:00:00.000Z'),
          rescheduleCount: 1,
        },
        {
          status: 'completed',
          type: 'call',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          dueAt: new Date('2026-08-16T08:00:00.000Z'),
          rescheduleCount: 0,
        },
        {
          status: 'pending',
          type: 'meeting',
          assignedToMembershipId: 'm2',
          assigneeName: 'Ravi',
          dueAt: new Date('2026-08-20T09:00:00.000Z'),
          rescheduleCount: 0,
        },
      ],
      { now, timeZone: 'UTC' },
    );

    expect(report.totals.total).toBe(3);
    expect(report.totals.pending).toBe(2);
    expect(report.totals.completed).toBe(1);
    expect(report.totals.overdue).toBe(1);
    expect(report.totals.upcoming).toBe(1);
    expect(report.totals.rescheduled).toBe(1);
    expect(report.totals.completionRateBps).toBe(3333);
    expect(report.byAssignee[0]?.name).toBe('Asha');
    expect(report.byType.find((row) => row.type === 'call')?.count).toBe(2);
  });
});
