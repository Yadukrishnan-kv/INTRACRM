import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_EVENT,
  channelsEnabled,
  fcmDataPayload,
  isNotificationEventCode,
  isPushPlatform,
} from './notification-events';

describe('notification catalog', () => {
  it('covers the four product events', () => {
    expect(NOTIFICATION_CATALOG.map((entry) => entry.code)).toEqual([
      NOTIFICATION_EVENT.leadAssigned,
      NOTIFICATION_EVENT.followUpDue,
      NOTIFICATION_EVENT.followUpOverdue,
      NOTIFICATION_EVENT.quotationPending,
    ]);
    expect(NOTIFICATION_CATALOG.map((entry) => entry.name)).toEqual([
      'Lead Assigned',
      'Follow-up Due',
      'Follow-up Overdue',
      'Quotation Pending',
    ]);
  });

  it('recognizes catalog codes and push platforms', () => {
    expect(isNotificationEventCode('lead.assigned')).toBe(true);
    expect(isNotificationEventCode('follow_up.due_today')).toBe(true);
    expect(isNotificationEventCode('quotation.follow_up_due')).toBe(false);
    expect(isPushPlatform('android')).toBe(true);
    expect(isPushPlatform('desktop')).toBe(false);
  });

  it('defaults both channels on when no preference row exists', () => {
    expect(channelsEnabled(null)).toEqual({ inApp: true, push: true });
    expect(channelsEnabled({ inAppEnabled: false, pushEnabled: true })).toEqual({
      inApp: false,
      push: true,
    });
  });

  it('stringifies FCM data values', () => {
    expect(
      fcmDataPayload({
        eventType: NOTIFICATION_EVENT.quotationPending,
        resourceType: 'quotation',
        resourceId: 'q-1',
        notificationId: 'n-1',
      }),
    ).toEqual({
      eventType: 'quotation.pending',
      resourceType: 'quotation',
      resourceId: 'q-1',
      notificationId: 'n-1',
    });
  });
});
