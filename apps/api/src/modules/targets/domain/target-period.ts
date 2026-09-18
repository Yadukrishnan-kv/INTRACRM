import { formatYmd, zonedLocalToUtc } from '../../tasks/domain/zoned-day';

export const PERIOD_TYPES = ['daily', 'monthly', 'quarterly', 'yearly', 'custom'] as const;
export type PeriodTypeCode = (typeof PERIOD_TYPES)[number];

export const SCOPE_TYPES = ['tenant', 'team', 'membership', 'branch'] as const;
export type ScopeTypeCode = (typeof SCOPE_TYPES)[number];

export const PERIOD_CATALOG: Array<{ code: PeriodTypeCode; title: string }> = [
  { code: 'daily', title: 'Daily' },
  { code: 'monthly', title: 'Monthly' },
  { code: 'quarterly', title: 'Quarterly' },
  { code: 'yearly', title: 'Yearly' },
  { code: 'custom', title: 'Custom' },
];

export const SCOPE_CATALOG: Array<{ code: ScopeTypeCode; title: string }> = [
  { code: 'tenant', title: 'Company' },
  { code: 'team', title: 'Team' },
  { code: 'membership', title: 'Staff' },
  { code: 'branch', title: 'Branch' },
];

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function ymdToUtcDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
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

export function addDaysYmd(ymd: string, days: number): string {
  const date = ymdToUtcDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysInclusive(startYmd: string, endYmd: string): number {
  const from = Date.parse(`${startYmd}T00:00:00.000Z`);
  const to = Date.parse(`${endYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function monthBoundsFromYmd(ymd: string): { start: string; end: string } {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function quarterBoundsFromYmd(ymd: string): { start: string; end: string } {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const start = `${String(year).padStart(4, '0')}-${String(quarterStartMonth).padStart(2, '0')}-01`;
  const endMonth = quarterStartMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const end = `${String(year).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function yearBoundsFromYmd(ymd: string): { start: string; end: string } {
  const year = ymd.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function resolvePeriod(input: {
  periodType: PeriodTypeCode;
  periodStart?: string;
  periodEnd?: string;
  now: Date;
  timeZone: string;
}): { start: string; end: string } {
  const today = formatYmd(input.now, input.timeZone);
  const ref = input.periodStart ?? today;
  switch (input.periodType) {
    case 'daily':
      return { start: ref, end: ref };
    case 'monthly':
      return monthBoundsFromYmd(ref);
    case 'quarterly':
      return quarterBoundsFromYmd(ref);
    case 'yearly':
      return yearBoundsFromYmd(ref);
    case 'custom': {
      const start = input.periodStart;
      const end = input.periodEnd;
      if (!start || !end) {
        throw new Error('Custom period requires periodStart and periodEnd');
      }
      if (end < start) {
        throw new Error('periodEnd must be on or after periodStart');
      }
      return { start, end };
    }
  }
}

export function periodRangeUtc(
  startYmd: string,
  endYmd: string,
  timeZone: string,
): { from: Date; toExclusive: Date } {
  return {
    from: zonedLocalToUtc(startYmd, 0, 0, 0, timeZone),
    toExclusive: zonedLocalToUtc(addDaysYmd(endYmd, 1), 0, 0, 0, timeZone),
  };
}

export function periodLabel(periodType: string, startYmd: string, endYmd: string): string {
  if (periodType === 'daily' || startYmd === endYmd) {
    return startYmd;
  }
  if (periodType === 'monthly' && startYmd.slice(0, 7) === endYmd.slice(0, 7)) {
    const month = Number(startYmd.slice(5, 7));
    const label = MONTH_LABELS[month - 1] ?? startYmd.slice(5, 7);
    return `${label} ${startYmd.slice(0, 4)}`;
  }
  return `${startYmd} – ${endYmd}`;
}

export function targetKinds(input: {
  periodType: string;
  scopeType: string;
  productId: string | null;
}): string[] {
  const kinds = [input.periodType];
  if (input.scopeType === 'team') {
    kinds.push('team');
  }
  if (input.productId) {
    kinds.push('product');
  }
  return kinds;
}

export const FORECAST_BANDS = [
  'not_started',
  'hit',
  'ahead',
  'on_track',
  'at_risk',
  'behind',
  'missed',
] as const;

export type ForecastBand = (typeof FORECAST_BANDS)[number];

export type TargetAchievement = {
  achievementBps: number | null;
  attainmentBps: number | null;
  balance: number;
  remaining: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  elapsedBps: number | null;
  plannedDaily: number;
  dailyRequired: number | null;
  expectedValue: number;
  variance: number;
  forecastValue: number | null;
  forecastBps: number | null;
  forecastBand: ForecastBand;
  onTrack: boolean;
};

const PACE_SLACK_BPS = 500;

function round4(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 10000) / 10000;
}

function ratioBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10000);
}

export function periodDayCounts(input: {
  periodStart: string;
  periodEnd: string;
  today: string;
}): { daysTotal: number; daysElapsed: number; daysRemaining: number } {
  const daysTotal = Math.max(1, daysInclusive(input.periodStart, input.periodEnd));
  if (input.today < input.periodStart) {
    return { daysTotal, daysElapsed: 0, daysRemaining: daysTotal };
  }
  if (input.today > input.periodEnd) {
    return { daysTotal, daysElapsed: daysTotal, daysRemaining: 0 };
  }
  return {
    daysTotal,
    daysElapsed: daysInclusive(input.periodStart, input.today),
    daysRemaining: daysInclusive(input.today, input.periodEnd),
  };
}

export function forecastBandFor(input: {
  today: string;
  periodStart: string;
  periodEnd: string;
  achievementBps: number | null;
  forecastBps: number | null;
}): ForecastBand {
  if (input.today < input.periodStart) {
    return 'not_started';
  }
  if ((input.achievementBps ?? 0) >= 10000) {
    return 'hit';
  }
  if (input.today > input.periodEnd) {
    return 'missed';
  }
  if (input.forecastBps == null) {
    return 'not_started';
  }
  if (input.forecastBps >= 10000) {
    return 'ahead';
  }
  if (input.forecastBps >= 9500) {
    return 'on_track';
  }
  if (input.forecastBps >= 7000) {
    return 'at_risk';
  }
  return 'behind';
}

export function computeAchievement(input: {
  achievedValue: number;
  targetValue: number;
  periodStart: string;
  periodEnd: string;
  today: string;
}): TargetAchievement {
  const { daysTotal, daysElapsed, daysRemaining } = periodDayCounts(input);
  const balance = round4(input.targetValue - input.achievedValue);
  const remaining = Math.max(0, balance);
  const elapsedBps = ratioBps(daysElapsed, daysTotal);
  const plannedDaily = round4(input.targetValue / daysTotal);
  const expectedValue = round4(input.targetValue * (daysElapsed / daysTotal));
  const variance = round4(input.achievedValue - expectedValue);
  const achievementBps = ratioBps(input.achievedValue, input.targetValue);

  let dailyRequired: number | null = null;
  if (daysRemaining > 0) {
    dailyRequired = remaining <= 0 ? 0 : round4(remaining / daysRemaining);
  }

  let forecastValue: number | null = null;
  if (input.today > input.periodEnd) {
    forecastValue = round4(input.achievedValue);
  } else if (input.today >= input.periodStart && daysElapsed > 0) {
    forecastValue = round4((input.achievedValue / daysElapsed) * daysTotal);
  }
  const forecastBps = forecastValue == null ? null : ratioBps(forecastValue, input.targetValue);
  const forecastBand = forecastBandFor({
    today: input.today,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    achievementBps,
    forecastBps,
  });
  const onTrack =
    forecastBand === 'hit' ||
    forecastBand === 'ahead' ||
    forecastBand === 'on_track' ||
    forecastBand === 'not_started' ||
    (achievementBps != null &&
      elapsedBps != null &&
      achievementBps >= elapsedBps - PACE_SLACK_BPS);

  return {
    achievementBps,
    attainmentBps: achievementBps,
    balance,
    remaining,
    daysTotal,
    daysElapsed,
    daysRemaining,
    elapsedBps,
    plannedDaily,
    dailyRequired,
    expectedValue,
    variance,
    forecastValue,
    forecastBps,
    forecastBand,
    onTrack,
  };
}

export function computeTargetPace(input: {
  achievedValue: number;
  targetValue: number;
  periodStart: string;
  periodEnd: string;
  today: string;
}): TargetAchievement {
  return computeAchievement(input);
}
