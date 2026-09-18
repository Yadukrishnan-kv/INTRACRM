export const DEFAULT_ATTENDANCE_TZ = 'Asia/Kolkata';
export const LATE_AFTER_MINUTES = 10 * 60 + 15;

export type AttendanceDayStatus = 'present' | 'late' | 'open' | 'absent';

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export function workDateYmd(at: Date, timeZone = DEFAULT_ATTENDANCE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function parseYmd(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachYmd(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDaysYmd(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function minutesInZone(at: Date, timeZone = DEFAULT_ATTENDANCE_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export function resolvePunchOutAt(punchedInAt: Date, now = new Date()): Date {
  if (punchedInAt.getTime() > now.getTime()) {
    return punchedInAt;
  }
  return now;
}

export function lateAfterLabel(minutes = LATE_AFTER_MINUTES): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function dayStatus(input: {
  firstInAt: Date | null;
  hasOpen: boolean;
  timeZone?: string;
  lateAfterMinutes?: number;
}): AttendanceDayStatus {
  if (!input.firstInAt) {
    return 'absent';
  }
  if (input.hasOpen) {
    return 'open';
  }
  const zone = input.timeZone ?? DEFAULT_ATTENDANCE_TZ;
  const lateAfter = input.lateAfterMinutes ?? LATE_AFTER_MINUTES;
  if (minutesInZone(input.firstInAt, zone) > lateAfter) {
    return 'late';
  }
  return 'present';
}
