// Pure helpers for the reports module (hub links, URL → query, small formatters).
import { P } from '../../auth/permissions';
import type { ReportQuery } from './api';
import { isPresetKey, presetRange, rangeToQuery, type DateMode, type PresetKey, type YmdRange } from './dates';

export type HubGroup = 'Dashboards' | 'Reports';

export type HubLink = {
  title: string;
  subtitle: string;
  to: string;
  anyOf: readonly string[];
  group: HubGroup;
};

/**
 * Mirrors mobile ReportsHubPage (same order, titles and permission gates), plus the
 * report screens mobile reaches from other menus (warranty, target, staff, pipeline).
 */
export const HUB_LINKS: HubLink[] = [
  { group: 'Dashboards', title: 'Monthly sales target', subtitle: 'Gauge, leaderboard, forecast, and daily insights', to: '/targets/sales-board', anyOf: [P.targetRead] },
  { group: 'Reports', title: 'Incentive report', subtitle: 'Earned incentive, achievement, and payouts', to: '/reports/incentives', anyOf: [P.incentiveRead] },
  { group: 'Dashboards', title: 'Follow-up calendar', subtitle: 'Month calendar, daily agenda, and click-to-call', to: '/tasks/calendar', anyOf: [P.followUpRead] },
  { group: 'Dashboards', title: 'Target & Achievement', subtitle: 'Staff targets, achievement, and MTD scores', to: '/performance', anyOf: [P.performanceRead] },
  { group: 'Dashboards', title: 'MTD Performance', subtitle: 'Monthly target, achievement, and category mix', to: '/dashboard/sales', anyOf: [P.dashboardRead] },
  { group: 'Reports', title: 'Funnel report', subtitle: 'Lead → Qualified → Quotation → Negotiation → Won', to: '/reports/funnel', anyOf: [P.dashboardRead] },
  { group: 'Reports', title: 'My funnel', subtitle: 'Your personal five-stage funnel', to: '/reports/funnel/me', anyOf: [P.dashboardSelf] },
  { group: 'Dashboards', title: 'Analytics dashboard', subtitle: 'Leads, qualified, quotations, won, and conversion', to: '/analytics', anyOf: [P.dashboardRead] },
  { group: 'Dashboards', title: 'My analytics', subtitle: 'Your personal funnel and conversion', to: '/analytics/me', anyOf: [P.dashboardSelf] },
  { group: 'Reports', title: 'Track report', subtitle: 'Create, update, delete, assignments, and status changes', to: '/reports/tracks', anyOf: [P.auditRead] },
  { group: 'Reports', title: 'Lead report', subtitle: 'Pipeline mix, sources, and owners', to: '/reports/leads', anyOf: [P.leadRead] },
  { group: 'Reports', title: 'Pipeline analytics', subtitle: 'Stage conversion and drop-off', to: '/reports/pipeline', anyOf: [P.leadRead] },
  { group: 'Reports', title: 'Follow-up report', subtitle: 'Completion, overdue, and staff load', to: '/reports/follow-ups', anyOf: [P.followUpRead] },
  { group: 'Reports', title: 'Quotation report', subtitle: 'Status, value, and close chance', to: '/reports/quotations', anyOf: [P.quotationRead] },
  { group: 'Reports', title: 'Sales report', subtitle: 'Won deals, revenue, and win rate', to: '/reports/sales', anyOf: [P.quotationRead] },
  { group: 'Reports', title: 'Warranty report', subtitle: 'Active, expired, claimed, and void', to: '/reports/warranties', anyOf: [P.warrantyRead] },
  { group: 'Reports', title: 'Site visit report', subtitle: 'Check-ins, GPS, photos, and outcomes', to: '/reports/site-visits', anyOf: [P.siteVisitRead] },
  { group: 'Reports', title: 'Attendance report', subtitle: 'Punch in/out, present, late, and hours', to: '/reports/attendance', anyOf: [P.attendanceRead] },
  { group: 'Reports', title: 'Target report', subtitle: 'On track, forecast, and attainment', to: '/reports/targets', anyOf: [P.targetRead] },
  { group: 'Reports', title: 'Performance report', subtitle: 'Scores, bands, and leaderboard', to: '/reports/performance', anyOf: [P.performanceRead] },
  { group: 'Reports', title: 'Staff report', subtitle: 'Roles, teams, and roster', to: '/reports/staff', anyOf: [P.tenantManageUsers] },
];

/** Every permission that unlocks at least one card — gates the hub route and nav item. */
export const HUB_PERMISSIONS: readonly string[] = [...new Set(HUB_LINKS.flatMap((l) => l.anyOf))];

export function visibleHubLinks(canAny: (anyOf: readonly string[]) => boolean): HubLink[] {
  return HUB_LINKS.filter((link) => canAny(link.anyOf));
}

/** URL search param names used by the date filter (kept apart from the API's from/to). */
export const RANGE_PARAM = 'range';
export const START_PARAM = 'start';
export const END_PARAM = 'end';

export type ReportFilterState = {
  preset: PresetKey;
  range: YmdRange | null;
  custom: { from: string; to: string };
  extras: Record<string, string>;
  query: ReportQuery;
};

/** Turns the page's URL params into the API query for a report endpoint. */
export function buildReportQuery(
  params: URLSearchParams,
  mode: DateMode,
  extraKeys: readonly string[],
  now: Date,
  defaultPreset: PresetKey = 'all',
): ReportFilterState {
  const raw = params.get(RANGE_PARAM);
  const preset: PresetKey = isPresetKey(raw) ? raw : defaultPreset;
  const custom = { from: params.get(START_PARAM) ?? '', to: params.get(END_PARAM) ?? '' };
  const range = presetRange(preset, now, custom);
  const extras: Record<string, string> = {};
  const query: ReportQuery = { ...rangeToQuery(range, mode) };
  for (const key of extraKeys) {
    const value = params.get(key) ?? '';
    extras[key] = value;
    if (value) query[key] = value;
  }
  return { preset, range, custom, extras, query };
}

/** Width (0–100) of a bar for `value` relative to the largest value in the set. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 1000) / 10);
}

export function maxOf<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((max, row) => Math.max(max, pick(row) || 0), 0);
}

/** 125 → "2h 05m"; mobile formatMinutes. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Ratio as basis points, or null when the denominator is zero (achieved / target). */
export function ratioBps(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10_000);
}

const RESOURCE_LABELS: Record<string, string> = { lead: 'Lead', quotation: 'Quotation', follow_up: 'Follow-up' };

export function resourceLabel(code: string): string {
  return RESOURCE_LABELS[code] ?? code.replace(/_/g, ' ');
}

const FORECAST_BANDS: Record<string, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  hit: 'Hit',
  missed: 'Missed',
  not_started: 'Not started',
};

export function forecastBandLabel(band: string | null): string {
  if (!band) return '—';
  return FORECAST_BANDS[band] ?? band.replace(/_/g, ' ');
}

const SCOPE_LABELS: Record<string, string> = { tenant: 'Company', team: 'Team', membership: 'Staff', branch: 'Branch' };

export function scopeLabel(code: string): string {
  return SCOPE_LABELS[code] ?? code;
}
