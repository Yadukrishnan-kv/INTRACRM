import { addDaysYmd, daysInclusive, monthBoundsFromYmd } from '../../targets/domain/target-period';
import { formatYmd } from './zoned-day';

/**
 * The month grid behind the follow-up calendar. A day carries counts, not
 * rows — the agenda for the selected day is a separate, paginated list — so a
 * month of a busy tenant stays one small payload.
 */

export const MONTH_RULE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Sunday-first, matching the grid the client draws. */
export const WEEK_START_DAY = 0;

const GRID_WEEKS = 6;
const GRID_DAYS = GRID_WEEKS * 7;

export function isMonthKey(value: string): boolean {
  return MONTH_RULE.test(value);
}

export function monthBounds(month: string): { start: string; end: string } {
  if (!isMonthKey(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  return monthBoundsFromYmd(`${month}-01`);
}

/** Day of week for a `YYYY-MM-DD`, 0 = Sunday. */
export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
}

/**
 * The six-week window the grid actually paints: the month, plus the leading
 * and trailing days that fill the first and last rows. Fixed at six weeks so
 * the grid does not change height between months.
 */
export function gridRange(month: string): { start: string; end: string } {
  const { start } = monthBounds(month);
  const gridStart = addDaysYmd(start, -weekdayOf(start));
  return { start: gridStart, end: addDaysYmd(gridStart, GRID_DAYS - 1) };
}

export function eachDay(startYmd: string, endYmd: string): string[] {
  const count = daysInclusive(startYmd, endYmd);
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDaysYmd(startYmd, index));
}

export const DAY_BANDS = ['overdue', 'due', 'completed', 'cancelled'] as const;
export type DayBand = (typeof DAY_BANDS)[number];

export type CalendarEntry = {
  dueAt: Date;
  status: string;
};

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  total: number;
  overdue: number;
  due: number;
  completed: number;
  cancelled: number;
  /** What colours the badge: the most urgent band present on the day. */
  band: DayBand | null;
};

/**
 * A pending follow-up is overdue once its due instant has passed; the day it
 * sits on is still its own due day, so a past day can hold both overdue and
 * completed work.
 */
export function bandFor(entry: CalendarEntry, now: Date): DayBand {
  if (entry.status === 'completed') {
    return 'completed';
  }
  if (entry.status === 'cancelled' || entry.status === 'skipped') {
    return 'cancelled';
  }
  return entry.dueAt.getTime() < now.getTime() ? 'overdue' : 'due';
}

function dominant(day: Omit<CalendarDay, 'band'>): DayBand | null {
  if (day.overdue > 0) {
    return 'overdue';
  }
  if (day.due > 0) {
    return 'due';
  }
  if (day.completed > 0) {
    return 'completed';
  }
  if (day.cancelled > 0) {
    return 'cancelled';
  }
  return null;
}

export type CalendarMonth = {
  month: string;
  timeZone: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  gridStart: string;
  gridEnd: string;
  days: CalendarDay[];
  totals: { total: number; overdue: number; due: number; completed: number; cancelled: number };
};

/**
 * Buckets follow-ups onto the grid. Entries outside the grid are ignored
 * rather than rejected, so a caller may hand over a slightly wider query
 * result without filtering it first.
 */
export function buildCalendarMonth(input: {
  month: string;
  entries: CalendarEntry[];
  timeZone: string;
  now: Date;
}): CalendarMonth {
  const { start: monthStart, end: monthEnd } = monthBounds(input.month);
  const { start: gridStart, end: gridEnd } = gridRange(input.month);
  const today = formatYmd(input.now, input.timeZone);

  const byDate = new Map<string, Omit<CalendarDay, 'band'>>();
  for (const date of eachDay(gridStart, gridEnd)) {
    byDate.set(date, {
      date,
      inMonth: date >= monthStart && date <= monthEnd,
      isToday: date === today,
      total: 0,
      overdue: 0,
      due: 0,
      completed: 0,
      cancelled: 0,
    });
  }

  const totals = { total: 0, overdue: 0, due: 0, completed: 0, cancelled: 0 };
  for (const entry of input.entries) {
    const date = formatYmd(entry.dueAt, input.timeZone);
    const day = byDate.get(date);
    if (!day) {
      continue;
    }
    const band = bandFor(entry, input.now);
    day.total += 1;
    day[band] += 1;
    totals.total += 1;
    totals[band] += 1;
  }

  return {
    month: input.month,
    timeZone: input.timeZone,
    today,
    monthStart,
    monthEnd,
    gridStart,
    gridEnd,
    days: [...byDate.values()].map((day) => ({ ...day, band: dominant(day) })),
    totals,
  };
}
