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


export const FOUNDER_KPI_CODES = [
  'todays_follow_ups',
  'mtd_billing',
  'target_achieved',
  'active_leads',
  'pending_quotations',
  'won_this_month',
] as const;

export type FounderKpiCode = (typeof FOUNDER_KPI_CODES)[number];

/**
 * How the client renders the figure. `money` values are minor currency,
 * `percent` values are basis points, `count` values are plain integers.
 */
export type KpiFormat = 'count' | 'money' | 'percent';

export type FounderKpiItem = {
  code: FounderKpiCode;
  title: string;
  value: number;
  format: KpiFormat;
  /** Same-period comparison against the previous window; null when there is no base. */
  deltaBps: number | null;
  detail: string;
};

export function isFounderKpiCode(value: string): value is FounderKpiCode {
  return (FOUNDER_KPI_CODES as readonly string[]).includes(value);
}

export type FounderKpiInput = {
  followUpsDueToday: number;
  followUpsOverdue: number;
  billingMtdMinor: number;
  billingPreviousMtdMinor: number;
  salesTargetMinor: number;
  salesAchievedMinor: number;
  activeLeads: number;
  activeLeadsPrevious: number;
  pendingQuotations: number;
  pendingQuotationValueMinor: number;
  wonThisMonth: number;
  wonPreviousMonth: number;
};

/**
 * The six tiles at the top of the founder dashboard. Every tile carries its
 * own format and a one-line detail, so the client renders the row without
 * knowing what any individual metric means.
 */
export function founderKpiItems(input: FounderKpiInput): FounderKpiItem[] {
  const targetBps =
    input.salesTargetMinor <= 0
      ? null
      : Math.round((input.salesAchievedMinor / input.salesTargetMinor) * 10000);

  return [
    {
      code: 'todays_follow_ups',
      title: "Today's Follow-ups",
      value: input.followUpsDueToday,
      format: 'count',
      deltaBps: null,
      detail:
        input.followUpsOverdue > 0
          ? `${input.followUpsOverdue} overdue alongside today's queue`
          : 'Nothing overdue',
    },
    {
      code: 'mtd_billing',
      title: 'MTD Billing',
      value: input.billingMtdMinor,
      format: 'money',
      deltaBps: deltaBps(input.billingMtdMinor, input.billingPreviousMtdMinor),
      detail: 'Invoiced this month to date',
    },
    {
      code: 'target_achieved',
      title: 'Target Achieved',
      value: targetBps ?? 0,
      format: 'percent',
      deltaBps: null,
      detail:
        targetBps == null
          ? 'No company revenue target this month'
          : 'Company revenue target, month to date',
    },
    {
      code: 'active_leads',
      title: 'Active Leads',
      value: input.activeLeads,
      format: 'count',
      deltaBps: deltaBps(input.activeLeads, input.activeLeadsPrevious),
      detail: 'Open leads not won or lost',
    },
    {
      code: 'pending_quotations',
      title: 'Pending Quotations',
      value: input.pendingQuotations,
      format: 'count',
      deltaBps: null,
      detail:
        input.pendingQuotationValueMinor > 0
          ? 'Sent or negotiating, awaiting a decision'
          : 'Nothing awaiting a decision',
    },
    {
      code: 'won_this_month',
      title: 'Won This Month',
      value: input.wonThisMonth,
      format: 'count',
      deltaBps: deltaBps(input.wonThisMonth, input.wonPreviousMonth),
      detail: 'Leads marked won since the first',
    },
  ];
}
