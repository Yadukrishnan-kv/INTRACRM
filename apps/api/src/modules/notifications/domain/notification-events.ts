export const NOTIFICATION_EVENT = {
  leadAssigned: 'lead.assigned',
  followUpDue: 'follow_up.due_today',
  followUpOverdue: 'follow_up.overdue',
  quotationPending: 'quotation.pending',
} as const;

export type NotificationEventCode =
  (typeof NOTIFICATION_EVENT)[keyof typeof NOTIFICATION_EVENT];

export const NOTIFICATION_EVENT_CODES = Object.values(NOTIFICATION_EVENT);

export const PUSH_PLATFORMS = ['android', 'ios', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export type NotificationCatalogEntry = {
  code: NotificationEventCode;
  name: string;
  description: string;
  resourceType: 'lead' | 'follow_up' | 'quotation';
  defaultTitle: string;
};

export const NOTIFICATION_CATALOG: NotificationCatalogEntry[] = [
  {
    code: NOTIFICATION_EVENT.leadAssigned,
    name: 'Lead Assigned',
    description: 'When a lead is assigned to you',
    resourceType: 'lead',
    defaultTitle: 'Lead Assigned',
  },
  {
    code: NOTIFICATION_EVENT.followUpDue,
    name: 'Follow-up Due',
    description: 'When a follow-up is due today',
    resourceType: 'follow_up',
    defaultTitle: 'Follow-up Due',
  },
  {
    code: NOTIFICATION_EVENT.followUpOverdue,
    name: 'Follow-up Overdue',
    description: 'When a follow-up is past its due time',
    resourceType: 'follow_up',
    defaultTitle: 'Follow-up Overdue',
  },
  {
    code: NOTIFICATION_EVENT.quotationPending,
    name: 'Quotation Pending',
    description: 'When a sent quotation is still waiting on a decision',
    resourceType: 'quotation',
    defaultTitle: 'Quotation Pending',
  },
];

export function isNotificationEventCode(value: string): value is NotificationEventCode {
  return (NOTIFICATION_EVENT_CODES as string[]).includes(value);
}

export function isPushPlatform(value: string): value is PushPlatform {
  return (PUSH_PLATFORMS as readonly string[]).includes(value);
}

export function catalogEntry(code: string): NotificationCatalogEntry | undefined {
  return NOTIFICATION_CATALOG.find((entry) => entry.code === code);
}

export function channelsEnabled(
  preference: { inAppEnabled: boolean; pushEnabled: boolean } | null,
): { inApp: boolean; push: boolean } {
  return {
    inApp: preference?.inAppEnabled ?? true,
    push: preference?.pushEnabled ?? true,
  };
}

export function fcmDataPayload(input: {
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  notificationId?: string | null;
}): Record<string, string> {
  return {
    eventType: input.eventType,
    resourceType: input.resourceType ?? '',
    resourceId: input.resourceId ?? '',
    notificationId: input.notificationId ?? '',
  };
}
