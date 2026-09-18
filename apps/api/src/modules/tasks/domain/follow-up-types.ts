export const FOLLOW_UP_TYPES = ['call', 'whatsapp', 'visit', 'meeting'] as const;
export type FollowUpTypeCode = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_STATUSES = ['pending', 'completed', 'cancelled', 'skipped'] as const;
export type FollowUpStatusCode = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_TYPE_TITLES: Record<FollowUpTypeCode, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Visit',
  meeting: 'Meeting',
};

export function isFollowUpType(value: string): value is FollowUpTypeCode {
  return (FOLLOW_UP_TYPES as readonly string[]).includes(value);
}

export function titleForFollowUpType(type: string): string {
  if (isFollowUpType(type)) {
    return FOLLOW_UP_TYPE_TITLES[type];
  }
  return 'Follow-up';
}

export function defaultTitleForType(type: string, title?: string | null): string {
  const trimmed = title?.trim();
  if (trimmed) {
    return trimmed;
  }
  return titleForFollowUpType(type);
}

export function isPendingFollowUp(status: string): boolean {
  return status === 'pending';
}

export function isOverdueFollowUp(status: string, dueAt: Date, now = new Date()): boolean {
  return isPendingFollowUp(status) && dueAt.getTime() < now.getTime();
}

export function followUpCatalog() {
  return FOLLOW_UP_TYPES.map((code) => ({
    code,
    title: FOLLOW_UP_TYPE_TITLES[code],
  }));
}
