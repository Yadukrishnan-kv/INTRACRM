// Pure helpers for dashboard, analytics, targets and performance screens.
// Ported from the mobile domain classes (dashboard.dart, analytics.dart,
// target.dart, sales_board.dart, performance.dart).

import { formatMoney } from '../../lib/format';
import type { DashboardWidget, SalesBoard, SalesBoardCard, StaffPerformance, Target, WidgetMetric } from './types';

// ---------------------------------------------------------------------------
// Numbers

/** `7250` → `73%` (rounded, like mobile's `bpsLabel`). */
export function pct(bps: number | null | undefined): string {
  return bps === null || bps === undefined ? '—' : `${Math.round(bps / 100)}%`;
}

/** Basis points → 0..1 for progress bars. */
export function fraction(bps: number | null | undefined): number {
  if (bps === null || bps === undefined) return 0;
  return Math.min(Math.max(bps, 0), 10000) / 10000;
}

function trim1(value: number): string {
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** Indian short form for a minor-currency amount: `₹18.5L`, `₹1.2Cr`, `₹5K`. */
export function rupeesShort(minor: number): string {
  const major = minor / 100;
  const abs = Math.abs(major);
  if (abs >= 10_000_000) return `₹${trim1(major / 10_000_000)}Cr`;
  if (abs >= 100_000) return `₹${trim1(major / 100_000)}L`;
  if (abs >= 1000) return `₹${trim1(major / 1000)}K`;
  return `₹${major.toFixed(0)}`;
}

/** A sales-board value: short rupees for money, plain number otherwise. */
export function boardValue(value: number, money: boolean): string {
  if (!money) return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return rupeesShort(value);
}

/** Signed short form for a forecast delta: `+₹10K`, `-₹4.2L`. */
export function boardDelta(value: number, money: boolean): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${boardValue(Math.abs(value), money)}`;
}

// ---------------------------------------------------------------------------
// Dashboard widgets

export const DASHBOARD_WIDGETS = ['leads', 'follow_ups', 'quotations', 'orders', 'sales', 'staff_performance'] as const;
export const STAFF_DASHBOARD_WIDGETS = ['leads', 'follow_ups', 'quotations', 'orders', 'sales'] as const;

export function widgetTitle(code: string): string {
  switch (code) {
    case 'leads':
      return "Today's leads";
    case 'follow_ups':
      return 'Follow-ups';
    case 'quotations':
      return 'Quotations';
    case 'orders':
      return 'Orders';
    case 'sales':
      return 'MTD Performance';
    case 'staff_performance':
      return 'Staff performance';
    default:
      return code;
  }
}

export function isMoneyWidget(w: Pick<DashboardWidget, 'code'>): boolean {
  return w.code === 'sales';
}

export function isScoreWidget(w: Pick<DashboardWidget, 'code'>): boolean {
  return w.code === 'staff_performance' || w.code === 'conversion';
}

export function dashboardValue(value: number, kind: { money?: boolean; score?: boolean }): string {
  if (kind.money) return formatMoney(value);
  if (kind.score) return pct(value);
  return String(value);
}

export function widgetPrimary(w: DashboardWidget): string {
  return dashboardValue(w.primary, { money: isMoneyWidget(w), score: isScoreWidget(w) });
}

export function widgetMonth(w: DashboardWidget): string {
  return dashboardValue(w.month, { money: isMoneyWidget(w), score: w.code === 'conversion' });
}

export function metricValue(w: DashboardWidget | null | undefined, code: string, fallback = 0): number {
  return w?.metrics.find((m) => m.code === code)?.value ?? fallback;
}

/** How a widget's sub-metric reads: money, percent or a count. */
export function metricDisplay(w: DashboardWidget, m: WidgetMetric): string {
  if (m.code.startsWith('revenue_') || (isMoneyWidget(w) && m.code !== 'achievement_bps')) return formatMoney(m.value);
  if (m.code.endsWith('_bps') || isScoreWidget(w)) return pct(m.value);
  return String(m.value);
}

/** `+12%`, `-3%`, `0%`, or `—` when there is nothing to compare against. */
export function deltaLabel(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  const p = Math.abs(Math.round(bps / 100));
  return bps > 0 ? `+${p}%` : bps < 0 ? `-${p}%` : '0%';
}

export function orderedWidgets(widgets: Record<string, DashboardWidget>, codes: readonly string[]): DashboardWidget[] {
  return codes.map((c) => widgets[c]).filter((w): w is DashboardWidget => !!w);
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Days from `from` to `to` inclusive, Sundays excluded (mobile's working-day rule). */
export function workingDaysBetween(from: string, to: string): number | null {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) return null;
  let days = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) days += 1;
  }
  return days;
}

/** `2026-10-13` → `13 October 2026`. */
export function prettyDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'long' })} ${d.getFullYear()}`;
}

/** `2026-10-03` → `03 Oct`. */
export function dayLabel(ymd: string): string {
  if (ymd.length < 10) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = Math.min(Math.max((Number(ymd.slice(5, 7)) || 1) - 1, 0), 11);
  return `${ymd.slice(8, 10)} ${months[month]}`;
}

/** Score-input tone, as on the personal dashboard: green ≥70%, amber ≥40%. */
export function kpiTone(bps: number | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (bps === null || bps === undefined) return 'neutral';
  if (bps >= 7000) return 'success';
  if (bps >= 4000) return 'warning';
  return 'danger';
}

/** Founder KPI tiles: where each one leads. */
export const KPI_ROUTES: Record<string, string> = {
  todays_follow_ups: '/tasks/calendar',
  mtd_billing: '/reports/sales',
  target_achieved: '/targets/sales-board',
  active_leads: '/leads',
  pending_quotations: '/quotations',
  won_this_month: '/reports/sales',
};

export function kpiValueLabel(item: { value: number; format: string }): string {
  if (item.format === 'percent') return `${Math.round(item.value / 100)}%`;
  if (item.format === 'money') return rupeesShort(item.value);
  return String(Math.round(item.value));
}

export function widgetRelated(code: string): { to: string; label: string } {
  switch (code) {
    case 'leads':
      return { to: '/leads', label: 'Leads' };
    case 'follow_ups':
      return { to: '/tasks', label: 'Follow-ups' };
    case 'quotations':
      return { to: '/quotations', label: 'Quotations' };
    case 'orders':
      return { to: '/reports/quotations', label: 'Quotation report' };
    case 'sales':
      return { to: '/performance', label: 'Target & Achievement' };
    case 'staff_performance':
      return { to: '/performance', label: 'Staff performance' };
    default:
      return { to: '/dashboard', label: 'Dashboard' };
  }
}

// ---------------------------------------------------------------------------
// Analytics

export const ANALYTICS_METRICS = ['leads', 'qualified', 'quotations', 'won', 'conversion'] as const;

export function analyticsTitle(code: string): string {
  switch (code) {
    case 'leads':
      return 'Leads';
    case 'qualified':
      return 'Qualified';
    case 'quotations':
      return 'Quotations';
    case 'won':
      return 'Won';
    case 'conversion':
      return 'Conversion';
    default:
      return code;
  }
}

export function analyticsRelated(code: string): { to: string; label: string } {
  switch (code) {
    case 'leads':
      return { to: '/leads', label: 'Leads' };
    case 'qualified':
      return { to: '/pipeline', label: 'Pipeline' };
    case 'quotations':
      return { to: '/quotations', label: 'Quotations' };
    case 'won':
      return { to: '/reports/sales', label: 'Sales report' };
    case 'conversion':
      return { to: '/reports/pipeline', label: 'Conversion analytics' };
    default:
      return { to: '/analytics', label: 'Analytics' };
  }
}

// ---------------------------------------------------------------------------
// Targets

export type TargetKind = 'monthly' | 'daily' | 'team' | 'product';
export const TARGET_KINDS: TargetKind[] = ['monthly', 'daily', 'team', 'product'];

export function kindTitle(code: string): string {
  const titles: Record<string, string> = {
    monthly: 'Monthly',
    daily: 'Daily',
    team: 'Team',
    product: 'Product',
    tenant: 'Company',
    membership: 'Staff',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
    custom: 'Custom',
  };
  return titles[code] ?? code;
}

export function forecastTitle(band: string | null | undefined): string {
  const titles: Record<string, string> = {
    hit: 'Hit',
    ahead: 'Ahead',
    on_track: 'On track',
    at_risk: 'At risk',
    behind: 'Behind',
    missed: 'Missed',
    not_started: 'Not started',
  };
  return band ? (titles[band] ?? band) : '—';
}

export function forecastTone(band: string | null | undefined): string {
  switch (band) {
    case 'hit':
    case 'ahead':
    case 'on_track':
      return 'success';
    case 'at_risk':
      return 'warning';
    case 'behind':
    case 'missed':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function isMoneyUnit(unit: string | null | undefined): boolean {
  return unit === 'minor_currency';
}

export function targetBps(t: Pick<Target, 'achievementBps' | 'attainmentBps'>): number | null {
  return t.achievementBps ?? t.attainmentBps;
}

export function targetValue(t: Pick<Target, 'metricUnit'>, value: number): string {
  if (isMoneyUnit(t.metricUnit)) return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value / 100)}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function targetRate(t: Pick<Target, 'metricUnit'>, value: number): string {
  if (isMoneyUnit(t.metricUnit))
    return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function targetTitle(t: Pick<Target, 'productName' | 'metricName' | 'scopeName' | 'scopeType'>): string {
  if (t.productName) return `${t.productName} · ${t.metricName}`;
  return `${t.metricName} · ${t.scopeName ?? kindTitle(t.scopeType)}`;
}

/** Positive = still to go, negative = surplus. */
export function signedBalance(t: Pick<Target, 'balance' | 'remaining'>): number {
  return t.balance ?? t.remaining;
}

/** List filter chip → API query, as on mobile's target list. */
export function targetFilterQuery(filter: string): { periodType?: string; scopeType?: string; hasProduct?: boolean } {
  switch (filter) {
    case 'monthly':
    case 'daily':
      return { periodType: filter };
    case 'team':
      return { scopeType: 'team' };
    case 'product':
      return { hasProduct: true };
    default:
      return {};
  }
}

export type TargetFormValues = {
  kind: TargetKind;
  scopeType: 'tenant' | 'team' | 'membership';
  metricCode: string;
  value: string;
  anchor: string;
  teamId: string;
  staffId: string;
  productId: string;
  notes: string;
};

/** Validates the create-target form and builds the POST body (mobile rules and messages). */
export function buildTargetBody(
  v: TargetFormValues,
  metric: { code: string; unit: string } | undefined,
): { body: Record<string, unknown> } | { error: string } {
  const raw = Number(v.value.trim());
  if (!metric || v.value.trim() === '' || Number.isNaN(raw) || raw < 0) return { error: 'Metric and a target value are required.' };
  if (v.kind === 'team' && !v.teamId) return { error: 'Select a team.' };
  if (v.kind === 'product' && !v.productId) return { error: 'Select a product.' };
  if (v.scopeType === 'team' && !v.teamId) return { error: 'Select a team.' };
  if (v.scopeType === 'membership' && !v.staffId) return { error: 'Select a staff member.' };
  const scopeType = v.kind === 'team' ? 'team' : v.scopeType;
  const scopeId = scopeType === 'team' ? v.teamId : scopeType === 'membership' ? v.staffId : '';
  const body: Record<string, unknown> = {
    periodType: v.kind === 'daily' ? 'daily' : 'monthly',
    scopeType,
    metricCode: metric.code,
    targetValue: isMoneyUnit(metric.unit) ? Math.round(raw * 100) : raw,
    periodStart: v.anchor,
  };
  if (scopeId) body.scopeId = scopeId;
  if (v.productId) body.productId = v.productId;
  if (v.notes.trim()) body.notes = v.notes.trim();
  return { body };
}

// ---------------------------------------------------------------------------
// Sales board

export function boardCard(board: SalesBoard, mine: boolean): SalesBoardCard {
  return mine ? (board.me ?? board.overall) : board.overall;
}

export function boardIsMoney(board: SalesBoard): boolean {
  return isMoneyUnit(board.metric.unit);
}

/** The text copied by the board's Share action. */
export function boardShareText(board: SalesBoard, card: SalesBoardCard): string {
  const money = boardIsMoney(board);
  return [
    `Monthly Sales Target — ${board.period.label}`,
    `${card.name}: ${boardValue(card.achievedValue, money)} of ${boardValue(card.targetValue, money)} (${pct(card.achievementBps)})`,
    card.pace.detail,
  ].join('\n');
}

/** Podium order: 2nd, 1st, 3rd, so the winner stands in the middle. */
export function podiumOrder<T extends { rank: number }>(entries: T[]): T[] {
  const byRank = (r: number) => entries.find((e) => e.rank === r);
  return [byRank(2), byRank(1), byRank(3)].filter((e): e is T => !!e);
}

// ---------------------------------------------------------------------------
// Performance

export function bandTitle(band: string): string {
  const titles: Record<string, string> = {
    outstanding: 'Outstanding',
    strong: 'Strong',
    average: 'Average',
    needs_work: 'Needs work',
    no_data: 'No data',
  };
  return titles[band] ?? band;
}

export function bandTone(band: string): string {
  switch (band) {
    case 'outstanding':
    case 'strong':
      return 'success';
    case 'average':
      return 'info';
    case 'needs_work':
      return 'danger';
    default:
      return 'neutral';
  }
}

export type LeaderboardCode = 'overall' | 'leadConversion' | 'followUpCompletion' | 'salesAchievement' | 'quotationConversion';
export const LEADERBOARDS: Array<{ code: LeaderboardCode; title: string }> = [
  { code: 'overall', title: 'Overall' },
  { code: 'leadConversion', title: 'Lead conversion' },
  { code: 'followUpCompletion', title: 'Follow-ups' },
  { code: 'salesAchievement', title: 'Sales' },
  { code: 'quotationConversion', title: 'Quotations' },
];

export function performanceTotals(rows: StaffPerformance[]) {
  return rows.reduce(
    (t, r) => ({
      leads: t.leads + r.leadsCreated,
      followUps: t.followUps + r.followUpsCompleted,
      quotations: t.quotations + r.quotationsSent,
      won: t.won + r.leadsWon,
    }),
    { leads: 0, followUps: 0, quotations: 0, won: 0 },
  );
}

/** Moves a period start by `step` periods: a day for daily, a month for monthly. */
export function shiftPeriodStart(periodType: string, start: string, step: number): string {
  const d = parseYmd(start) ?? new Date();
  if (periodType === 'daily') {
    d.setDate(d.getDate() + step);
    return toYmd(d);
  }
  const months = periodType === 'quarterly' ? 3 : periodType === 'yearly' ? 12 : 1;
  return toYmd(new Date(d.getFullYear(), d.getMonth() + step * months, 1));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

export function todayYmd(): string {
  return toYmd(new Date());
}
