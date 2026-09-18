import { startOfNextZonedDay } from './zoned-day';

export const FOLLOW_UP_ENGINE_BUCKETS = [
  'overdue',
  'today',
  'upcoming',
  'no_follow_up',
] as const;

export type FollowUpEngineBucket = (typeof FOLLOW_UP_ENGINE_BUCKETS)[number];

export const FOLLOW_UP_ENGINE_EVENT = {
  overdue: 'follow_up.overdue',
  dueToday: 'follow_up.due_today',
  upcoming: 'follow_up.upcoming',
  escalated: 'follow_up.escalated',
  noFollowUp: 'lead.no_follow_up',
} as const;

export const DEFAULT_FOLLOW_UP_ENGINE_RULES = {
  upcomingHorizonHours: 48,
  managerEscalationHours: 4,
  adminEscalationHours: 24,
} as const;

export type FollowUpEngineRules = {
  upcomingHorizonHours: number;
  managerEscalationHours: number;
  adminEscalationHours: number;
};

export const FOLLOW_UP_ENGINE_RULES_CATALOG: Array<{
  level: number;
  code: string;
  title: string;
  hours: number;
  audience: string;
}> = [
  {
    level: 0,
    code: FOLLOW_UP_ENGINE_EVENT.overdue,
    title: 'Notify assignee when overdue',
    hours: 0,
    audience: 'Assignee',
  },
  {
    level: 1,
    code: FOLLOW_UP_ENGINE_EVENT.escalated,
    title: 'Escalate to Business Manager after 4 hours overdue',
    hours: DEFAULT_FOLLOW_UP_ENGINE_RULES.managerEscalationHours,
    audience: 'Business Manager (same team, else tenant)',
  },
  {
    level: 2,
    code: FOLLOW_UP_ENGINE_EVENT.escalated,
    title: 'Escalate to Admin / Founder after 24 hours overdue',
    hours: DEFAULT_FOLLOW_UP_ENGINE_RULES.adminEscalationHours,
    audience: 'Admin, Founder',
  },
];

export function classifyFollowUpBucket(params: {
  status: string;
  dueAt: Date;
  now: Date;
  timeZone: string;
}): FollowUpEngineBucket | null {
  if (params.status !== 'pending') {
    return null;
  }
  if (params.dueAt.getTime() < params.now.getTime()) {
    return 'overdue';
  }
  if (params.dueAt.getTime() < startOfNextZonedDay(params.now, params.timeZone).getTime()) {
    return 'today';
  }
  return 'upcoming';
}

export function hoursOverdue(dueAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - dueAt.getTime()) / 3_600_000);
}

export function reachedEscalationLevels(
  hours: number,
  rules: FollowUpEngineRules = DEFAULT_FOLLOW_UP_ENGINE_RULES,
): number[] {
  const levels = [0];
  if (hours >= rules.managerEscalationHours) {
    levels.push(1);
  }
  if (hours >= rules.adminEscalationHours) {
    levels.push(2);
  }
  return levels;
}

export function shouldNotifyUpcoming(params: {
  bucket: FollowUpEngineBucket | null;
  dueAt: Date;
  remindAt: Date | null;
  now: Date;
  rules?: FollowUpEngineRules;
}): boolean {
  if (params.bucket !== 'upcoming') {
    return false;
  }
  const horizonHours = (params.rules ?? DEFAULT_FOLLOW_UP_ENGINE_RULES).upcomingHorizonHours;
  if (params.remindAt && params.remindAt.getTime() <= params.now.getTime()) {
    return true;
  }
  return params.dueAt.getTime() - params.now.getTime() <= horizonHours * 3_600_000;
}

export function eventTypeForBucket(bucket: FollowUpEngineBucket): string {
  switch (bucket) {
    case 'overdue':
      return FOLLOW_UP_ENGINE_EVENT.overdue;
    case 'today':
      return FOLLOW_UP_ENGINE_EVENT.dueToday;
    case 'upcoming':
      return FOLLOW_UP_ENGINE_EVENT.upcoming;
    case 'no_follow_up':
      return FOLLOW_UP_ENGINE_EVENT.noFollowUp;
  }
}

export function titleForEngineEvent(eventType: string, fallback: string): string {
  switch (eventType) {
    case FOLLOW_UP_ENGINE_EVENT.overdue:
      return 'Follow-up Overdue';
    case FOLLOW_UP_ENGINE_EVENT.dueToday:
      return 'Follow-up Due';
    case FOLLOW_UP_ENGINE_EVENT.upcoming:
      return 'Upcoming follow-up';
    case FOLLOW_UP_ENGINE_EVENT.escalated:
      return 'Follow-up escalated';
    case FOLLOW_UP_ENGINE_EVENT.noFollowUp:
      return 'Lead has no follow-up';
    default:
      return fallback;
  }
}
