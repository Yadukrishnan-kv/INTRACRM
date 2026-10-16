import { FOLLOW_UP_TYPE_TITLES, FOLLOW_UP_TYPES, type CalendarDay, type CalendarMonth, type FollowUpListParams, type FollowUpType, type ListBucket } from './types';

export function typeTitle(type: string): string {
  return (FOLLOW_UP_TYPES as readonly string[]).includes(type) ? FOLLOW_UP_TYPE_TITLES[type as FollowUpType] : 'Follow-up';
}

export function isFollowUpType(value: string): value is FollowUpType {
  return (FOLLOW_UP_TYPES as readonly string[]).includes(value);
}

export const PRIORITY_LABELS: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

/** Top-level "view" chips, mirroring mobile's FollowUpFilterChips. */
export type StatusView = 'all' | 'overdue' | 'pending' | 'completed';

const BUCKETS: readonly string[] = ['overdue', 'today', 'upcoming', 'no_follow_up'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type ListFilter = {
  view: StatusView;
  bucket: ListBucket | 'no_follow_up' | null;
  type: FollowUpType | null;
  assignee: string | null;
  dueFrom: string | null;
  dueTo: string | null;
  dueOn: string | null;
};

/**
 * URL search params → list filter. Mobile opens the list on "pending";
 * picking an engine bucket clears the status chip (bucket implies pending).
 */
export function parseListFilter(params: URLSearchParams): ListFilter {
  const rawView = params.get('view');
  const bucket = params.get('bucket');
  const type = params.get('type') ?? '';
  const ymd = (key: string) => {
    const v = params.get(key);
    return v && YMD.test(v) ? v : null;
  };
  const view: StatusView =
    rawView === 'all' || rawView === 'overdue' || rawView === 'completed' || rawView === 'pending'
      ? rawView
      : bucket
        ? 'all'
        : 'pending';
  return {
    view,
    bucket: bucket && BUCKETS.includes(bucket) ? (bucket as ListFilter['bucket']) : null,
    type: isFollowUpType(type) ? type : null,
    assignee: params.get('assignee') || null,
    dueFrom: ymd('dueFrom'),
    dueTo: ymd('dueTo'),
    dueOn: ymd('dueOn'),
  };
}

/** List filter → GET /follow-ups query. */
export function toListParams(filter: ListFilter): FollowUpListParams {
  const out: FollowUpListParams = {};
  if (filter.bucket && filter.bucket !== 'no_follow_up') out.bucket = filter.bucket;
  if (filter.view === 'overdue') out.overdue = true;
  else if (filter.view === 'pending' || filter.view === 'completed') out.status = filter.view;
  if (filter.type) out.type = filter.type;
  if (filter.assignee) out.assignedToMembershipId = filter.assignee;
  if (filter.dueOn) out.dueOn = filter.dueOn;
  else {
    if (filter.dueFrom) out.dueFrom = filter.dueFrom;
    if (filter.dueTo) out.dueTo = filter.dueTo;
  }
  return out;
}

export type FollowUpFormValues = {
  leadId: string;
  type: string;
  title: string;
  dueAt: string; // datetime-local
  remindAt: string; // datetime-local
  priority: string;
  notes: string;
};

/** Client-side checks matching the API DTO (and mobile's "Lead and due date are required"). */
export function validateFollowUpForm(values: FollowUpFormValues, mode: 'create' | 'edit', now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isFollowUpType(values.type)) errors.type = 'Choose a type.';
  const title = values.title.trim();
  if (title && title.length < 2) errors.title = 'Title must be at least 2 characters.';
  if (title.length > 160) errors.title = 'Title must be at most 160 characters.';
  if (values.notes.length > 2000) errors.notes = 'Notes must be at most 2000 characters.';
  if (values.priority && !['1', '2', '3'].includes(values.priority)) errors.priority = 'Priority must be 1–3.';
  if (mode === 'create') {
    if (!values.leadId) errors.leadId = 'Lead is required.';
    const due = values.dueAt ? new Date(values.dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) errors.dueAt = 'Due date is required.';
    else if (due.getTime() < now.getTime() - 60_000) errors.dueAt = 'Due date can’t be in the past.';
    if (values.remindAt) {
      const remind = new Date(values.remindAt);
      if (Number.isNaN(remind.getTime())) errors.remindAt = 'Invalid reminder time.';
      else if (due && remind.getTime() > due.getTime()) errors.remindAt = 'Reminder must be before the due time.';
    }
  }
  return errors;
}

/** Shifts a `YYYY-MM` key by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = (y ?? 1970) * 12 + ((m ?? 1) - 1) + delta;
  const year = Math.floor(idx / 12);
  const mon = (idx % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

export function isMonthKey(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? month} ${y ?? ''}`.trim();
}

export function longDate(ymd: string): string {
  if (!YMD.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-');
  return `${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)} ${Number(d)}, ${y}`;
}

/** Today when it falls inside the painted month, else the first of the month (mobile's defaultSelectedDay). */
export function defaultSelectedDay(month: Pick<CalendarMonth, 'today' | 'monthStart' | 'monthEnd'>): string {
  return month.today >= month.monthStart && month.today <= month.monthEnd ? month.today : month.monthStart;
}

export function chunkWeeks(days: CalendarDay[]): CalendarDay[][] {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Where a notification's resource lives in the web console (mobile's locationForNotification). */
export function notificationLink(resourceType: string | null, resourceId: string | null): string | null {
  const id = resourceId?.trim() ?? '';
  if (!id) return null;
  switch (resourceType) {
    case 'follow_up':
      return `/tasks/${id}`;
    case 'lead':
      return `/leads/${id}`;
    case 'quotation':
      return `/quotations/${id}`;
    default:
      return null;
  }
}

/** Ids of loaded notifications still unread — "Mark all read" posts each (the API has no bulk endpoint). */
export function unreadIds(items: ReadonlyArray<{ id: string; readAt: string | null }>): string[] {
  return items.filter((n) => !n.readAt).map((n) => n.id);
}
