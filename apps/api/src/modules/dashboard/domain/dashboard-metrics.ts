import { formatYmd } from '../../tasks/domain/zoned-day';
import { addDaysYmd } from '../../targets/domain/target-period';

export const DASHBOARD_WIDGET_CODES = [
  'leads',
  'follow_ups',
  'quotations',
  'orders',
  'sales',
  'staff_performance',
] as const;

export type DashboardWidgetCode = (typeof DASHBOARD_WIDGET_CODES)[number];

export const DASHBOARD_WIDGET_CATALOG: Array<{ code: DashboardWidgetCode; title: string }> = [
  { code: 'leads', title: "Today's leads" },
  { code: 'follow_ups', title: 'Follow-ups' },
  { code: 'quotations', title: 'Quotations' },
  { code: 'orders', title: 'Orders' },
  { code: 'sales', title: 'Sales' },
  { code: 'staff_performance', title: 'Staff performance' },
];

export const STAFF_DASHBOARD_WIDGET_CODES = [
  'leads',
  'follow_ups',
  'quotations',
  'orders',
  'sales',
] as const;

export type StaffDashboardWidgetCode = (typeof STAFF_DASHBOARD_WIDGET_CODES)[number];

export const STAFF_DASHBOARD_WIDGET_CATALOG: Array<{ code: StaffDashboardWidgetCode; title: string }> = [
  { code: 'leads', title: "Today's leads" },
  { code: 'follow_ups', title: 'Follow-ups' },
  { code: 'quotations', title: 'Quotations' },
  { code: 'orders', title: 'Orders' },
  { code: 'sales', title: 'Sales' },
];

export function isDashboardWidgetCode(value: string): value is DashboardWidgetCode {
  return (DASHBOARD_WIDGET_CODES as readonly string[]).includes(value);
}

export type SeriesPoint = {
  date: string;
  label: string;
  value: number;
};

export type MixSlice = {
  code: string;
  label: string;
  value: number;
};

export type SeriesInput = {
  at: Date;
  value?: number;
};

export function deltaBps(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 10000);
}

export function trailingDays(endYmd: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDaysYmd(endYmd, index - (count - 1)));
}

export function dayLabel(ymd: string): string {
  return String(Number(ymd.slice(8, 10)));
}

export function buildSeries(days: string[], points: SeriesInput[], timeZone: string): SeriesPoint[] {
  const totals = new Map(days.map((day) => [day, 0]));
  for (const point of points) {
    const day = formatYmd(point.at, timeZone);
    if (!totals.has(day)) {
      continue;
    }
    totals.set(day, (totals.get(day) ?? 0) + (point.value ?? 1));
  }
  return days.map((date) => ({
    date,
    label: dayLabel(date),
    value: totals.get(date) ?? 0,
  }));
}

export type PersonalKpiItem = {
  code: string;
  title: string;
  valueBps: number | null;
  detail: string;
};

export function personalKpiItems(input: {
  leadsCreated: number;
  leadsWon: number;
  leadsLost: number;
  followUpsDue: number;
  followUpsCompleted: number;
  quotationsSent: number;
  quotationsWon: number;
  quotationsLost: number;
  revenueMinor: number;
  salesTargetMinor: number | null;
  leadConversionBps: number | null;
  followUpCompletionBps: number | null;
  salesAchievementBps: number | null;
  quotationConversionBps: number | null;
}): PersonalKpiItem[] {
  const salesDetail =
    input.salesTargetMinor == null
      ? 'No membership revenue target this period'
      : `₹${Math.round(input.revenueMinor / 100)} of ₹${Math.round(input.salesTargetMinor / 100)}`;
  return [
    {
      code: 'lead_conversion',
      title: 'Lead conversion',
      valueBps: input.leadConversionBps,
      detail: `${input.leadsWon} won · ${input.leadsLost} lost · ${input.leadsCreated} created`,
    },
    {
      code: 'follow_up_completion',
      title: 'Follow-up completion',
      valueBps: input.followUpCompletionBps,
      detail: `${input.followUpsCompleted} completed of ${input.followUpsDue} due`,
    },
    {
      code: 'sales_achievement',
      title: 'Sales achievement',
      valueBps: input.salesAchievementBps,
      detail: salesDetail,
    },
    {
      code: 'quotation_conversion',
      title: 'Quotation conversion',
      valueBps: input.quotationConversionBps,
      detail: `${input.quotationsWon} won · ${input.quotationsLost} lost · ${input.quotationsSent} sent`,
    },
  ];
}

