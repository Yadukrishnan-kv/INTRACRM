import {
  calendarDaysBetween,
  defaultReminderSchedule,
  isClosingOverdue,
  isClosingSoon,
  predictQuotationClose,
  reminderBucket,
  shouldNotifyUpcomingReminder,
} from './quotation-follow-up';
import { isPendingQuotation } from './quotation-types';

describe('quotation follow-up buckets', () => {
  const tz = 'Asia/Kolkata';
  const now = new Date('2026-08-16T10:00:00.000Z');

  it('classifies reminder overdue, today, upcoming, and no reminder', () => {
    expect(
      reminderBucket({
        status: 'sent',
        nextFollowUpAt: new Date('2026-08-16T09:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('overdue');
    expect(
      reminderBucket({
        status: 'follow_up',
        nextFollowUpAt: new Date('2026-08-16T12:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('today');
    expect(
      reminderBucket({
        status: 'negotiation',
        nextFollowUpAt: new Date('2026-08-17T18:30:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBe('upcoming');
    expect(
      reminderBucket({
        status: 'approved',
        nextFollowUpAt: null,
        now,
        timeZone: tz,
      }),
    ).toBe('no_follow_up');
    expect(
      reminderBucket({
        status: 'won',
        nextFollowUpAt: new Date('2026-08-16T09:00:00.000Z'),
        now,
        timeZone: tz,
      }),
    ).toBeNull();
  });

  it('flags closing soon and closing overdue from expected_close_on', () => {
    expect(
      isClosingSoon({
        status: 'negotiation',
        expectedCloseOn: '2026-08-20',
        now,
        timeZone: tz,
      }),
    ).toBe(true);
    expect(
      isClosingOverdue({
        status: 'sent',
        expectedCloseOn: '2026-08-10',
        now,
        timeZone: tz,
      }),
    ).toBe(true);
    expect(isPendingQuotation('sent')).toBe(true);
    expect(isPendingQuotation('draft')).toBe(false);
  });

  it('schedules a 48h reminder and 14-day expected close', () => {
    const schedule = defaultReminderSchedule({ now, timeZone: tz });
    expect(schedule.nextFollowUpAt.toISOString()).toBe('2026-08-18T10:00:00.000Z');
    expect(schedule.remindAt.toISOString()).toBe('2026-08-18T06:00:00.000Z');
    expect(schedule.expectedCloseOn).toBe('2026-08-30');
    expect(calendarDaysBetween('2026-08-16', '2026-08-30')).toBe(14);
  });

  it('notifies upcoming when remind_at hits', () => {
    expect(
      shouldNotifyUpcomingReminder({
        bucket: 'upcoming',
        nextFollowUpAt: new Date('2026-08-20T10:00:00.000Z'),
        remindAt: now,
        now,
      }),
    ).toBe(true);
  });
});

describe('quotation closing prediction', () => {
  const tz = 'Asia/Kolkata';
  const now = new Date('2026-08-16T10:00:00.000Z');
  const createdAt = new Date('2026-08-01T10:00:00.000Z');

  it('returns won and lost as terminals', () => {
    expect(
      predictQuotationClose(
        {
          status: 'won',
          nextFollowUpAt: null,
          remindAt: null,
          expectedCloseOn: '2026-08-20',
          validUntilOn: null,
          lastFollowedUpAt: null,
          sentAt: now,
          createdAt,
        },
        now,
        tz,
      ),
    ).toMatchObject({ probabilityBps: 10000, band: 'won' });
    expect(
      predictQuotationClose(
        {
          status: 'lost',
          nextFollowUpAt: null,
          remindAt: null,
          expectedCloseOn: null,
          validUntilOn: null,
          lastFollowedUpAt: null,
          sentAt: now,
          createdAt,
        },
        now,
        tz,
      ).band,
    ).toBe('lost');
  });

  it('drops probability when the reminder is overdue', () => {
    const prediction = predictQuotationClose(
      {
        status: 'sent',
        nextFollowUpAt: new Date('2026-08-16T09:00:00.000Z'),
        remindAt: null,
        expectedCloseOn: '2026-08-30',
        validUntilOn: null,
        lastFollowedUpAt: null,
        sentAt: new Date('2026-08-14T10:00:00.000Z'),
        createdAt,
      },
      now,
      tz,
    );
    expect(prediction.probabilityBps).toBe(1000);
    expect(prediction.band).toBe('low');
    expect(prediction.reasons.some((reason) => reason.includes('overdue'))).toBe(true);
  });

  it('raises probability for approved quotes closing soon after a recent follow-up', () => {
    const prediction = predictQuotationClose(
      {
        status: 'approved',
        nextFollowUpAt: new Date('2026-08-16T12:00:00.000Z'),
        remindAt: null,
        expectedCloseOn: '2026-08-18',
        validUntilOn: null,
        lastFollowedUpAt: new Date('2026-08-16T08:00:00.000Z'),
        sentAt: new Date('2026-08-10T10:00:00.000Z'),
        createdAt,
      },
      now,
      tz,
    );
    expect(prediction.probabilityBps).toBe(9800);
    expect(prediction.band).toBe('high');
    expect(prediction.expectedCloseOn).toBe('2026-08-18');
  });
});
