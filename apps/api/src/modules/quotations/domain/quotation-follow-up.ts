import { formatYmd, startOfNextZonedDay } from '../../tasks/domain/zoned-day';
import { isPendingQuotation, isTerminalQuotation } from './quotation-types';

export const QUOTATION_FOLLOW_UP_BUCKETS = [
  'pending',
  'overdue',
  'today',
  'upcoming',
  'closing_soon',
  'closing_overdue',
  'no_follow_up',
] as const;

export type QuotationFollowUpBucket = (typeof QUOTATION_FOLLOW_UP_BUCKETS)[number];

export const QUOTATION_FOLLOW_UP_EVENT = {
  pending: 'quotation.pending',
  due: 'quotation.follow_up_due',
  overdue: 'quotation.follow_up_overdue',
  upcoming: 'quotation.follow_up_upcoming',
  closingSoon: 'quotation.closing_soon',
  closingOverdue: 'quotation.closing_overdue',
  noFollowUp: 'quotation.no_follow_up',
  escalated: 'quotation.escalated',
} as const;

export const DEFAULT_QUOTATION_FOLLOW_UP_RULES = {
  reminderHours: 48,
  remindBeforeHours: 4,
  expectedCloseDays: 14,
  closingSoonDays: 7,
  staleDays: 14,
  managerEscalationHours: 4,
  adminEscalationHours: 24,
  upcomingHorizonHours: 48,
} as const;

export type QuotationFollowUpRules = typeof DEFAULT_QUOTATION_FOLLOW_UP_RULES;

export const QUOTATION_FOLLOW_UP_RULES_CATALOG: Array<{
  level: number;
  code: string;
  title: string;
  hours: number;
  audience: string;
}> = [
  {
    level: 0,
    code: QUOTATION_FOLLOW_UP_EVENT.overdue,
    title: 'Notify assignee when a quotation reminder is overdue',
    hours: 0,
    audience: 'Assignee',
  },
  {
    level: 1,
    code: QUOTATION_FOLLOW_UP_EVENT.escalated,
    title: 'Escalate to Business Manager after 4 hours overdue',
    hours: DEFAULT_QUOTATION_FOLLOW_UP_RULES.managerEscalationHours,
    audience: 'Business Manager (same team, else tenant)',
  },
  {
    level: 2,
    code: QUOTATION_FOLLOW_UP_EVENT.escalated,
    title: 'Escalate to Admin / Founder after 24 hours overdue',
    hours: DEFAULT_QUOTATION_FOLLOW_UP_RULES.adminEscalationHours,
    audience: 'Admin, Founder',
  },
];

const BASE_CLOSE_BPS: Record<string, number> = {
  draft: 800,
  sent: 2200,
  follow_up: 3800,
  customer_deciding: 5200,
  negotiation: 6800,
  approved: 8600,
  won: 10000,
  lost: 0,
};

export type ClosingPredictionBand = 'low' | 'medium' | 'high' | 'won' | 'lost';

export type ClosingPrediction = {
  probabilityBps: number;
  band: ClosingPredictionBand;
  expectedCloseOn: string | null;
  reasons: string[];
};

export type QuotationFollowUpInput = {
  status: string;
  nextFollowUpAt: Date | null;
  remindAt: Date | null;
  expectedCloseOn: Date | string | null;
  validUntilOn: Date | string | null;
  lastFollowedUpAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

export function addDaysYmd(ymd: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-').map(Number);
  if (yearRaw === undefined || monthRaw === undefined || dayRaw === undefined) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw + days)).toISOString().slice(0, 10);
}

export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

export function dateToYmd(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function defaultReminderSchedule(params: {
  now: Date;
  timeZone: string;
  validUntilOn?: Date | string | null;
  expectedCloseOn?: Date | string | null;
  rules?: QuotationFollowUpRules;
}): { nextFollowUpAt: Date; remindAt: Date; expectedCloseOn: string } {
  const rules = params.rules ?? DEFAULT_QUOTATION_FOLLOW_UP_RULES;
  const expected =
    dateToYmd(params.expectedCloseOn) ??
    dateToYmd(params.validUntilOn) ??
    addDaysYmd(formatYmd(params.now, params.timeZone), rules.expectedCloseDays);
  return {
    nextFollowUpAt: new Date(params.now.getTime() + rules.reminderHours * 3_600_000),
    remindAt: new Date(
      params.now.getTime() + (rules.reminderHours - rules.remindBeforeHours) * 3_600_000,
    ),
    expectedCloseOn: expected,
  };
}

export function resolveExpectedCloseOn(
  input: Pick<QuotationFollowUpInput, 'expectedCloseOn' | 'validUntilOn' | 'sentAt' | 'createdAt'>,
  now: Date,
  timeZone: string,
): string | null {
  return (
    dateToYmd(input.expectedCloseOn) ??
    dateToYmd(input.validUntilOn) ??
    dateToYmd(input.sentAt ? new Date(input.sentAt.getTime() + 14 * 86_400_000) : null) ??
    addDaysYmd(formatYmd(input.createdAt ?? now, timeZone), 14)
  );
}

export function reminderBucket(params: {
  status: string;
  nextFollowUpAt: Date | null;
  now: Date;
  timeZone: string;
}): Extract<QuotationFollowUpBucket, 'overdue' | 'today' | 'upcoming' | 'no_follow_up'> | null {
  if (!isPendingQuotation(params.status)) {
    return null;
  }
  if (!params.nextFollowUpAt) {
    return 'no_follow_up';
  }
  if (params.nextFollowUpAt.getTime() < params.now.getTime()) {
    return 'overdue';
  }
  if (params.nextFollowUpAt.getTime() < startOfNextZonedDay(params.now, params.timeZone).getTime()) {
    return 'today';
  }
  return 'upcoming';
}

export function isClosingSoon(params: {
  status: string;
  expectedCloseOn: string | null;
  now: Date;
  timeZone: string;
  rules?: QuotationFollowUpRules;
}): boolean {
  if (!isPendingQuotation(params.status) || !params.expectedCloseOn) {
    return false;
  }
  const today = formatYmd(params.now, params.timeZone);
  const days = calendarDaysBetween(today, params.expectedCloseOn);
  const horizon = (params.rules ?? DEFAULT_QUOTATION_FOLLOW_UP_RULES).closingSoonDays;
  return days >= 0 && days <= horizon;
}

export function isClosingOverdue(params: {
  status: string;
  expectedCloseOn: string | null;
  now: Date;
  timeZone: string;
}): boolean {
  if (!isPendingQuotation(params.status) || !params.expectedCloseOn) {
    return false;
  }
  return calendarDaysBetween(formatYmd(params.now, params.timeZone), params.expectedCloseOn) < 0;
}

export function shouldNotifyUpcomingReminder(params: {
  bucket: string | null;
  nextFollowUpAt: Date;
  remindAt: Date | null;
  now: Date;
  rules?: QuotationFollowUpRules;
}): boolean {
  if (params.bucket !== 'upcoming') {
    return false;
  }
  if (params.remindAt && params.remindAt.getTime() <= params.now.getTime()) {
    return true;
  }
  const horizon = (params.rules ?? DEFAULT_QUOTATION_FOLLOW_UP_RULES).upcomingHorizonHours;
  return params.nextFollowUpAt.getTime() - params.now.getTime() <= horizon * 3_600_000;
}

export function hoursOverdue(dueAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - dueAt.getTime()) / 3_600_000);
}

export function reachedEscalationLevels(
  hours: number,
  rules: QuotationFollowUpRules = DEFAULT_QUOTATION_FOLLOW_UP_RULES,
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

export function predictQuotationClose(
  input: QuotationFollowUpInput,
  now: Date,
  timeZone: string,
  rules: QuotationFollowUpRules = DEFAULT_QUOTATION_FOLLOW_UP_RULES,
): ClosingPrediction {
  const expectedCloseOn = resolveExpectedCloseOn(input, now, timeZone);
  if (input.status === 'won') {
    return { probabilityBps: 10000, band: 'won', expectedCloseOn, reasons: ['Marked won'] };
  }
  if (input.status === 'lost') {
    return { probabilityBps: 0, band: 'lost', expectedCloseOn, reasons: ['Marked lost'] };
  }

  let probabilityBps = BASE_CLOSE_BPS[input.status] ?? 2000;
  const reasons: string[] = [`Stage ${input.status.replaceAll('_', ' ')}`];
  const today = formatYmd(now, timeZone);

  if (expectedCloseOn) {
    const days = calendarDaysBetween(today, expectedCloseOn);
    if (days < 0) {
      probabilityBps -= 1500;
      reasons.push('Expected close date has passed');
    } else if (days <= rules.closingSoonDays) {
      probabilityBps += 800;
      reasons.push('Expected to close within 7 days');
    }
  }

  const reminder = reminderBucket({
    status: input.status,
    nextFollowUpAt: input.nextFollowUpAt,
    now,
    timeZone,
  });
  if (reminder === 'overdue') {
    probabilityBps -= 1200;
    reasons.push('Follow-up reminder is overdue');
  } else if (reminder === 'no_follow_up' && isPendingQuotation(input.status)) {
    probabilityBps -= 800;
    reasons.push('No reminder scheduled');
  }

  if (input.lastFollowedUpAt) {
    const hours = (now.getTime() - input.lastFollowedUpAt.getTime()) / 3_600_000;
    if (hours <= 48) {
      probabilityBps += 400;
      reasons.push('Followed up in the last 2 days');
    }
  }

  const lastTouch = input.lastFollowedUpAt ?? input.sentAt ?? input.createdAt;
  const staleMs = rules.staleDays * 86_400_000;
  if (now.getTime() - lastTouch.getTime() > staleMs && isPendingQuotation(input.status)) {
    probabilityBps -= 1000;
    reasons.push('No activity for 14 days');
  }

  const validUntil = dateToYmd(input.validUntilOn);
  if (validUntil && calendarDaysBetween(today, validUntil) < 0 && !isTerminalQuotation(input.status)) {
    probabilityBps -= 2000;
    reasons.push('Validity date has passed');
  }

  probabilityBps = Math.min(9900, Math.max(0, probabilityBps));
  const band: ClosingPredictionBand =
    probabilityBps >= 7000 ? 'high' : probabilityBps >= 4000 ? 'medium' : 'low';
  return { probabilityBps, band, expectedCloseOn, reasons };
}

export function titleForQuotationFollowUpEvent(eventType: string, fallback: string): string {
  switch (eventType) {
    case QUOTATION_FOLLOW_UP_EVENT.pending:
      return 'Quotation Pending';
    case QUOTATION_FOLLOW_UP_EVENT.due:
      return 'Quotation follow-up due today';
    case QUOTATION_FOLLOW_UP_EVENT.overdue:
      return 'Quotation reminder overdue';
    case QUOTATION_FOLLOW_UP_EVENT.upcoming:
      return 'Upcoming quotation follow-up';
    case QUOTATION_FOLLOW_UP_EVENT.closingSoon:
      return 'Quotation closing soon';
    case QUOTATION_FOLLOW_UP_EVENT.closingOverdue:
      return 'Expected close date passed';
    case QUOTATION_FOLLOW_UP_EVENT.noFollowUp:
      return 'Pending quotation has no reminder';
    case QUOTATION_FOLLOW_UP_EVENT.escalated:
      return 'Quotation follow-up escalated';
    default:
      return fallback;
  }
}
