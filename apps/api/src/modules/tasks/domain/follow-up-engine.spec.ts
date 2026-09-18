import {
  classifyFollowUpBucket,
  hoursOverdue,
  reachedEscalationLevels,
  shouldNotifyUpcoming,
} from './follow-up-engine';
import { formatYmd, startOfNextZonedDay, startOfZonedDay } from './zoned-day';

describe('zoned day bounds', () => {
  it('places Asia/Kolkata midnight after the previous UTC evening', () => {
    const now = new Date('2026-08-16T18:30:00.000Z');
    expect(formatYmd(now, 'Asia/Kolkata')).toBe('2026-08-17');
    expect(startOfZonedDay(now, 'Asia/Kolkata').toISOString()).toBe('2026-08-16T18:30:00.000Z');
    expect(startOfNextZonedDay(now, 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-17T18:30:00.000Z',
    );
  });
});

describe('follow-up engine buckets', () => {
  const tz = 'Asia/Kolkata';
  const now = new Date('2026-08-16T10:00:00.000Z');

  it('classifies overdue, today, upcoming, and ignores completed', () => {
    expect(
      classifyFollowUpBucket({
        status: 'pending',
        dueAt: new Date('2026-08-16T09:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('overdue');
    expect(
      classifyFollowUpBucket({
        status: 'pending',
        dueAt: new Date('2026-08-16T12:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('today');
    expect(
      classifyFollowUpBucket({
        status: 'pending',
        dueAt: new Date('2026-08-17T18:30:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('upcoming');
    expect(
      classifyFollowUpBucket({
        status: 'completed',
        dueAt: new Date('2026-08-16T09:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBeNull();
  });

  it('escalates to manager at 4h and admin at 24h', () => {
    expect(reachedEscalationLevels(hoursOverdue(new Date('2026-08-16T09:00:00.000Z'), now))).toEqual(
      [0],
    );
    expect(reachedEscalationLevels(5)).toEqual([0, 1]);
    expect(reachedEscalationLevels(24)).toEqual([0, 1, 2]);
  });

  it('notifies upcoming when remind_at hits or due within 48h', () => {
    const due = new Date('2026-08-17T20:00:00.000Z');
    expect(
      shouldNotifyUpcoming({
        bucket: 'upcoming',
        dueAt: due,
        remindAt: now,
        now,
      }),
    ).toBe(true);
    expect(
      shouldNotifyUpcoming({
        bucket: 'upcoming',
        dueAt: new Date('2026-08-20T10:00:00.000Z'),
        remindAt: null,
        now,
      }),
    ).toBe(false);
  });
});
