import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FollowUpStatus,
  LeadLifecycleStatus,
  PeriodType,
  QuotationStatus,
  TargetScopeType,
} from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { salesAchievementBps } from '../../performance/domain/performance-score';
import { PENDING_QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, QuotationStatusCode } from '../../quotations/domain/quotation-types';
import { formatYmd, startOfNextZonedDay, startOfZonedDay } from '../../tasks/domain/zoned-day';
import { TargetsService } from '../../targets/application/targets.service';
import {
  addDaysYmd,
  monthBoundsFromYmd,
  periodLabel,
  periodRangeUtc,
  ymdToUtcDate,
} from '../../targets/domain/target-period';
import {
  DASHBOARD_WIDGET_CATALOG,
  DashboardWidgetCode,
  FounderKpiItem,
  founderKpiItems,
  MixSlice,
  STAFF_DASHBOARD_WIDGET_CATALOG,
  SeriesPoint,
  buildSeries,
  deltaBps,
  isDashboardWidgetCode,
  personalKpiItems,
  trailingDays,
} from '../domain/dashboard-metrics';

const WEEK_DAYS = 7;
const SERIES_CAP = 5000;

type Range = { gte: Date; lt: Date };

export type DashboardWidgetView = {
  code: DashboardWidgetCode;
  title: string;
  primary: number;
  primaryLabel: string;
  previous: number;
  deltaBps: number | null;
  month: number;
  metrics: Array<{ code: string; label: string; value: number }>;
  series: SeriesPoint[];
  mix: MixSlice[];
};

export type DashboardKpisView = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: { start: string; end: string; label: string };
  items: FounderKpiItem[];
};

/**
 * The same day-of-month in another month, pulled back to that month's last
 * day when it is shorter — 31 March against February lands on the 28th.
 */
function clampDayOfMonth(monthStart: string, monthEnd: string, day: number): string {
  const lastDay = Number(monthEnd.slice(8, 10));
  const target = Math.min(Math.max(day, 1), lastDay);
  return `${monthStart.slice(0, 8)}${String(target).padStart(2, '0')}`;
}

export type DashboardOverview = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: { start: string; end: string; label: string };
  widgets: {
    leads: DashboardWidgetView;
    follow_ups: DashboardWidgetView;
    quotations: DashboardWidgetView;
    orders: DashboardWidgetView;
    sales: DashboardWidgetView;
    staff_performance?: DashboardWidgetView;
  };
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    private readonly targets: TargetsService,
  ) {}

  catalog() {
    return { widgets: DASHBOARD_WIDGET_CATALOG, staffWidgets: STAFF_DASHBOARD_WIDGET_CATALOG };
  }

  async overview(actor: AuthUser, membershipId?: string): Promise<DashboardOverview> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const todayYmd = formatYmd(now, timeZone);
    const yesterdayYmd = trailingDays(todayYmd, 2)[0] ?? todayYmd;
    const weekDays = trailingDays(todayYmd, WEEK_DAYS);
    const month = monthBoundsFromYmd(todayYmd);
    const todayStart = startOfZonedDay(now, timeZone);
    const todayEnd = startOfNextZonedDay(now, timeZone);
    const today: Range = { gte: todayStart, lt: todayEnd };
    const yesterday = periodRangeUtc(yesterdayYmd, yesterdayYmd, timeZone);
    const monthRange = periodRangeUtc(month.start, month.end, timeZone);
    const weekRange = periodRangeUtc(weekDays[0] ?? todayYmd, todayYmd, timeZone);
    const yesterdayRange: Range = { gte: yesterday.from, lt: yesterday.toExclusive };
    const monthWindow: Range = { gte: monthRange.from, lt: monthRange.toExclusive };
    const weekWindow: Range = { gte: weekRange.from, lt: weekRange.toExclusive };
    const leadOwner = membershipId ? { ownerMembershipId: membershipId } : {};
    const assignee = membershipId ? { assignedToMembershipId: membershipId } : {};
    const ownedLead = membershipId ? { deletedAt: null, ownerMembershipId: membershipId } : { deletedAt: null };

    const [
      leadsCreatedToday,
      leadsCreatedYesterday,
      leadsCreatedMonth,
      leadLifecycle,
      leadsWonToday,
      leadsCreatedWeek,
      followUpsOverdue,
      followUpsDueToday,
      followUpsUpcoming,
      followUpsCompletedToday,
      followUpsLoadToday,
      followUpsLoadYesterday,
      followUpsCompletedWeek,
      quotationStatus,
      quotationsSentToday,
      quotationsWonToday,
      quotationsLostToday,
      quotationsSentYesterday,
      quotationsWonYesterday,
      quotationsWonMonth,
      quotationsSentWeek,
      quotationsWonWeek,
      salesTarget,
      staff,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, deletedAt: null, createdAt: today, ...leadOwner } }),
      this.prisma.lead.count({ where: { tenantId, deletedAt: null, createdAt: yesterdayRange, ...leadOwner } }),
      this.prisma.lead.count({ where: { tenantId, deletedAt: null, createdAt: monthWindow, ...leadOwner } }),
      this.prisma.lead.groupBy({
        by: ['lifecycleStatus'],
        where: { tenantId, deletedAt: null, ...leadOwner },
        _count: { _all: true },
      }),
      this.prisma.leadStageChange.count({
        where: {
          tenantId,
          changedAt: today,
          toLifecycleStatus: LeadLifecycleStatus.won,
          lead: ownedLead,
        },
      }),
      this.prisma.lead.findMany({
        where: { tenantId, deletedAt: null, createdAt: weekWindow, ...leadOwner },
        select: { createdAt: true },
        take: SERIES_CAP,
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.pending,
          dueAt: { lt: now },
          ...assignee,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.pending,
          dueAt: { gte: now, lt: todayEnd },
          ...assignee,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.pending,
          dueAt: { gte: todayEnd },
          ...assignee,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.completed,
          completedAt: today,
          ...assignee,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { not: FollowUpStatus.cancelled },
          dueAt: today,
          ...assignee,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { not: FollowUpStatus.cancelled },
          dueAt: yesterdayRange,
          ...assignee,
        },
      }),
      this.prisma.followUp.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.completed,
          completedAt: weekWindow,
          ...assignee,
        },
        select: { completedAt: true },
        take: SERIES_CAP,
      }),
      this.prisma.quotation.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null, ...assignee },
        _count: { _all: true },
      }),
      this.prisma.quotation.count({
        where: { tenantId, deletedAt: null, sentAt: today, ...assignee },
      }),
      this.prisma.quotation.count({
        where: { tenantId, deletedAt: null, wonAt: today, ...assignee },
      }),
      this.prisma.quotation.count({
        where: { tenantId, deletedAt: null, lostAt: today, ...assignee },
      }),
      this.prisma.quotation.count({
        where: { tenantId, deletedAt: null, sentAt: yesterdayRange, ...assignee },
      }),
      this.prisma.quotation.count({
        where: { tenantId, deletedAt: null, wonAt: yesterdayRange, ...assignee },
      }),
      this.prisma.quotation.aggregate({
        where: { tenantId, deletedAt: null, wonAt: monthWindow, ...assignee },
        _count: { _all: true },
        _sum: { totalMinor: true },
      }),
      this.prisma.quotation.findMany({
        where: { tenantId, deletedAt: null, sentAt: weekWindow, ...assignee },
        select: { sentAt: true },
        take: SERIES_CAP,
      }),
      this.prisma.quotation.findMany({
        where: { tenantId, deletedAt: null, wonAt: weekWindow, ...assignee },
        select: { wonAt: true, totalMinor: true },
        take: SERIES_CAP,
      }),
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          metricCode: 'revenue',
          periodType: PeriodType.monthly,
          periodStart: ymdToUtcDate(month.start),
          periodEnd: ymdToUtcDate(month.end),
          ...(membershipId
            ? { scopeType: TargetScopeType.membership, scopeId: membershipId }
            : { scopeType: TargetScopeType.tenant }),
        },
        select: { productId: true, targetValue: true },
      }),
      membershipId ? Promise.resolve(null) : this.performance.report(actor, { periodType: 'monthly' }),
    ]);

    const lifecycleCount = (status: LeadLifecycleStatus) =>
      leadLifecycle.find((row) => row.lifecycleStatus === status)?._count._all ?? 0;
    const quoteCount = (status: QuotationStatus) =>
      quotationStatus.find((row) => row.status === status)?._count._all ?? 0;
    const openQuotations = (PENDING_QUOTATION_STATUSES as readonly string[]).reduce(
      (sum, status) => sum + quoteCount(status as QuotationStatus),
      0,
    );
    const salesTodayMinor = quotationsWonWeek
      .filter((row) => row.wonAt && row.wonAt >= today.gte && row.wonAt < today.lt)
      .reduce((sum, row) => sum + Number(row.totalMinor), 0);
    const salesYesterdayMinor = quotationsWonWeek
      .filter((row) => row.wonAt && row.wonAt >= yesterdayRange.gte && row.wonAt < yesterdayRange.lt)
      .reduce((sum, row) => sum + Number(row.totalMinor), 0);
    const salesMonthMinor = Number(quotationsWonMonth._sum.totalMinor ?? 0);
    const generalTargets = salesTarget.filter((row) => row.productId == null);
    const targetSource = generalTargets.length > 0 ? generalTargets : salesTarget;
    const targetMinor = targetSource.reduce((sum, row) => sum + Number(row.targetValue), 0);
    const achievementBps = targetMinor > 0 ? salesAchievementBps({ target: targetMinor, achieved: salesMonthMinor }) : null;
    const ordersMonth = quotationsWonMonth._count._all;
    const staffTop = (staff?.top ?? []).slice(0, 5).map((row) => ({
      code: row.membershipId,
      label: row.name,
      value: row.scoreBps ?? 0,
    }));

    const leadsWidget = this.toWidgetView({
      code: 'leads',
      primary: leadsCreatedToday,
      primaryLabel: 'Today',
      previous: leadsCreatedYesterday,
      month: leadsCreatedMonth,
      metrics: [
        { code: 'open', label: 'Open', value: lifecycleCount(LeadLifecycleStatus.open) },
        { code: 'won_today', label: 'Won today', value: leadsWonToday },
        { code: 'won', label: 'Won', value: lifecycleCount(LeadLifecycleStatus.won) },
        { code: 'lost', label: 'Lost', value: lifecycleCount(LeadLifecycleStatus.lost) },
      ],
      series: buildSeries(
        weekDays,
        leadsCreatedWeek.map((row) => ({ at: row.createdAt })),
        timeZone,
      ),
      mix: [
        { code: 'open', label: 'Open', value: lifecycleCount(LeadLifecycleStatus.open) },
        { code: 'won', label: 'Won', value: lifecycleCount(LeadLifecycleStatus.won) },
        { code: 'lost', label: 'Lost', value: lifecycleCount(LeadLifecycleStatus.lost) },
      ],
    });
    const followUpsWidget = this.toWidgetView({
      code: 'follow_ups',
      primary: followUpsLoadToday,
      primaryLabel: 'Due today',
      previous: followUpsLoadYesterday,
      month: followUpsOverdue + followUpsDueToday + followUpsUpcoming,
      metrics: [
        { code: 'overdue', label: 'Overdue', value: followUpsOverdue },
        { code: 'remaining', label: 'Remaining today', value: followUpsDueToday },
        { code: 'completed_today', label: 'Completed today', value: followUpsCompletedToday },
        { code: 'upcoming', label: 'Upcoming', value: followUpsUpcoming },
      ],
      series: buildSeries(
        weekDays,
        followUpsCompletedWeek.flatMap((row) => (row.completedAt ? [{ at: row.completedAt }] : [])),
        timeZone,
      ),
      mix: [
        { code: 'overdue', label: 'Overdue', value: followUpsOverdue },
        { code: 'due_today', label: 'Due today', value: followUpsDueToday },
        { code: 'upcoming', label: 'Upcoming', value: followUpsUpcoming },
      ],
    });
    const quotationsWidget = this.toWidgetView({
      code: 'quotations',
      primary: quotationsSentToday,
      primaryLabel: 'Sent today',
      previous: quotationsSentYesterday,
      month: openQuotations,
      metrics: [
        { code: 'open', label: 'Open', value: openQuotations },
        { code: 'won_today', label: 'Won today', value: quotationsWonToday },
        { code: 'lost_today', label: 'Lost today', value: quotationsLostToday },
        { code: 'draft', label: 'Draft', value: quoteCount(QuotationStatus.draft) },
      ],
      series: buildSeries(
        weekDays,
        quotationsSentWeek.flatMap((row) => (row.sentAt ? [{ at: row.sentAt }] : [])),
        timeZone,
      ),
      mix: quotationStatus.map((row) => ({
        code: row.status,
        label: QUOTATION_STATUS_LABELS[row.status as QuotationStatusCode],
        value: row._count._all,
      })),
    });
    const ordersWidget = this.toWidgetView({
      code: 'orders',
      primary: quotationsWonToday,
      primaryLabel: 'Today',
      previous: quotationsWonYesterday,
      month: ordersMonth,
      metrics: [
        { code: 'month', label: 'This month', value: ordersMonth },
        { code: 'lost_today', label: 'Lost today', value: quotationsLostToday },
      ],
      series: buildSeries(
        weekDays,
        quotationsWonWeek.flatMap((row) => (row.wonAt ? [{ at: row.wonAt }] : [])),
        timeZone,
      ),
      mix: [
        { code: 'won', label: 'Won', value: quoteCount(QuotationStatus.won) },
        { code: 'lost', label: 'Lost', value: quoteCount(QuotationStatus.lost) },
        { code: 'open', label: 'Open', value: openQuotations },
      ],
    });
    const salesWidget = this.toWidgetView({
      code: 'sales',
      primary: salesTodayMinor,
      primaryLabel: 'Today',
      previous: salesYesterdayMinor,
      month: salesMonthMinor,
      metrics: [
        { code: 'month', label: 'This month', value: salesMonthMinor },
        { code: 'target', label: 'Month target', value: targetMinor },
        { code: 'achievement_bps', label: 'Achievement bps', value: achievementBps ?? 0 },
      ],
      series: buildSeries(
        weekDays,
        quotationsWonWeek.flatMap((row) =>
          row.wonAt ? [{ at: row.wonAt, value: Number(row.totalMinor) }] : [],
        ),
        timeZone,
      ),
      mix: [
        { code: 'won', label: 'Won value', value: salesMonthMinor },
        { code: 'target', label: 'Target', value: targetMinor },
      ],
    });
    const widgets: DashboardOverview['widgets'] = {
      leads: leadsWidget,
      follow_ups: followUpsWidget,
      quotations: quotationsWidget,
      orders: ordersWidget,
      sales: salesWidget,
    };
    if (staff) {
      widgets.staff_performance = this.toWidgetView({
        code: 'staff_performance',
        primary: staff.totals.averageScoreBps ?? 0,
        primaryLabel: 'Average score',
        previous: staff.totals.averageScoreBps ?? 0,
        month: staff.totals.staff,
        metrics: [
          { code: 'scored', label: 'Scored', value: staff.totals.scored },
          { code: 'outstanding', label: 'Outstanding', value: staff.totals.outstanding },
          { code: 'strong', label: 'Strong', value: staff.totals.strong },
          { code: 'needs_work', label: 'Needs work', value: staff.totals.needsWork },
        ],
        series: staffTop.map((row, index) => ({
          date: String(index + 1),
          label: row.label.split(' ')[0] ?? row.label,
          value: row.value,
        })),
        mix: [
          { code: 'outstanding', label: 'Outstanding', value: staff.totals.outstanding },
          { code: 'strong', label: 'Strong', value: staff.totals.strong },
          { code: 'average', label: 'Average', value: staff.totals.average },
          { code: 'needs_work', label: 'Needs work', value: staff.totals.needsWork },
          { code: 'no_data', label: 'No data', value: staff.totals.noData },
        ],
      });
    }

    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      today: todayYmd,
      month: {
        start: month.start,
        end: month.end,
        label: periodLabel('monthly', month.start, month.end),
      },
      widgets,
    };
  }

  /**
   * The six KPI tiles at the top of the founder dashboard. Deliberately its
   * own query set rather than a slice of `overview()`: the tiles are the first
   * paint of the home screen and must not wait on the week-long series and
   * staff leaderboard the full overview loads.
   */
  async kpis(actor: AuthUser): Promise<DashboardKpisView> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const todayYmd = formatYmd(now, timeZone);
    const month = monthBoundsFromYmd(todayYmd);
    const monthRange = periodRangeUtc(month.start, month.end, timeZone);
    const monthWindow: Range = { gte: monthRange.from, lt: monthRange.toExclusive };

    // Same slice of the previous month, so the comparison is like-for-like on
    // day 9 rather than a full month against nine days.
    const previousMonth = monthBoundsFromYmd(addDaysYmd(month.start, -1));
    const dayOfMonth = Number(todayYmd.slice(8, 10));
    const previousEnd = clampDayOfMonth(previousMonth.start, previousMonth.end, dayOfMonth);
    const previousRange = periodRangeUtc(previousMonth.start, previousEnd, timeZone);
    const previousWindow: Range = { gte: previousRange.from, lt: previousRange.toExclusive };
    const previousFullRange = periodRangeUtc(previousMonth.start, previousMonth.end, timeZone);
    const previousFullWindow: Range = {
      gte: previousFullRange.from,
      lt: previousFullRange.toExclusive,
    };

    const todayStart = startOfZonedDay(now, timeZone);
    const todayEnd = startOfNextZonedDay(now, timeZone);
    const openStatuses = [LeadLifecycleStatus.open, LeadLifecycleStatus.recycled];
    const closedStatuses = [LeadLifecycleStatus.won, LeadLifecycleStatus.lost];

    const [
      followUpsDueToday,
      followUpsOverdue,
      billingMtd,
      billingPrevious,
      salesTarget,
      salesAchieved,
      activeLeads,
      leadsOpenedThisMonth,
      leadsClosedThisMonth,
      pendingQuotations,
      pendingQuotationValue,
      wonThisMonth,
      wonPreviousMonth,
    ] = await Promise.all([
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { not: FollowUpStatus.cancelled },
          dueAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId,
          deletedAt: null,
          status: FollowUpStatus.pending,
          dueAt: { lt: now },
        },
      }),
      this.prisma.billingInvoice.aggregate({
        _sum: { totalMinor: true },
        where: { tenantId, deletedAt: null, createdAt: monthWindow },
      }),
      this.prisma.billingInvoice.aggregate({
        _sum: { totalMinor: true },
        where: { tenantId, deletedAt: null, createdAt: previousWindow },
      }),
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          metricCode: 'revenue',
          periodType: PeriodType.monthly,
          scopeType: TargetScopeType.tenant,
          productId: null,
          periodStart: ymdToUtcDate(month.start),
          periodEnd: ymdToUtcDate(month.end),
        },
        select: { targetValue: true },
      }),
      this.prisma.quotation.aggregate({
        _sum: { totalMinor: true },
        where: {
          tenantId,
          deletedAt: null,
          status: QuotationStatus.won,
          wonAt: monthWindow,
        },
      }),
      this.prisma.lead.count({
        where: { tenantId, deletedAt: null, lifecycleStatus: { in: openStatuses } },
      }),
      this.prisma.lead.count({
        where: { tenantId, deletedAt: null, createdAt: monthWindow },
      }),
      this.prisma.leadStageChange.findMany({
        where: {
          tenantId,
          changedAt: monthWindow,
          toLifecycleStatus: { in: closedStatuses },
          lead: { deletedAt: null },
        },
        select: { leadId: true },
        distinct: ['leadId'],
        take: SERIES_CAP,
      }),
      this.prisma.quotation.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...PENDING_QUOTATION_STATUSES] as QuotationStatus[] },
        },
      }),
      this.prisma.quotation.aggregate({
        _sum: { totalMinor: true },
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...PENDING_QUOTATION_STATUSES] as QuotationStatus[] },
        },
      }),
      this.prisma.leadStageChange.count({
        where: {
          tenantId,
          changedAt: monthWindow,
          toLifecycleStatus: LeadLifecycleStatus.won,
          lead: { deletedAt: null },
        },
      }),
      this.prisma.leadStageChange.count({
        where: {
          tenantId,
          changedAt: previousFullWindow,
          toLifecycleStatus: LeadLifecycleStatus.won,
          lead: { deletedAt: null },
        },
      }),
    ]);

    // Rewind the open pipeline to the first of the month: what is open now,
    // less what opened since, plus what closed since.
    const activeLeadsPrevious = Math.max(
      0,
      activeLeads - leadsOpenedThisMonth + leadsClosedThisMonth.length,
    );

    const items = founderKpiItems({
      followUpsDueToday,
      followUpsOverdue,
      billingMtdMinor: Number(billingMtd._sum.totalMinor ?? 0),
      billingPreviousMtdMinor: Number(billingPrevious._sum.totalMinor ?? 0),
      salesTargetMinor: salesTarget.reduce((sum, row) => sum + Number(row.targetValue), 0),
      salesAchievedMinor: Number(salesAchieved._sum.totalMinor ?? 0),
      activeLeads,
      activeLeadsPrevious,
      pendingQuotations,
      pendingQuotationValueMinor: Number(pendingQuotationValue._sum.totalMinor ?? 0),
      wonThisMonth,
      wonPreviousMonth,
    });

    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      today: todayYmd,
      month: { start: month.start, end: month.end, label: periodLabel('monthly', month.start, month.end) },
      items,
    };
  }

  async widget(actor: AuthUser, code: string) {
    if (!isDashboardWidgetCode(code)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Unknown dashboard widget', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const overview = await this.overview(actor);
    const widget = overview.widgets[code];
    if (!widget) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Dashboard widget not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return {
      generatedAt: overview.generatedAt,
      timezone: overview.timezone,
      today: overview.today,
      month: overview.month,
      widget,
    };
  }

  async mine(actor: AuthUser) {
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const [board, card, targets] = await Promise.all([
      this.overview(actor, actor.membershipId),
      this.performance.me(actor, { periodType: 'monthly' }),
      this.targets.currentForStaff(actor),
    ]);
    const staff = card.staff;
    return {
      generatedAt: board.generatedAt,
      timezone: board.timezone,
      today: board.today,
      month: board.month,
      membership: {
        id: staff.membershipId,
        name: staff.name,
        designation: staff.designation,
        teamName: staff.teamName,
        rank: staff.rank,
        teamRank: staff.teamRank,
        rankedOutOf: staff.rankedOutOf,
        scoreBps: staff.scoreBps,
        scoreBand: staff.scoreBand,
      },
      kpis: personalKpiItems({
        leadsCreated: staff.leadsCreated,
        leadsWon: staff.leadsWon,
        leadsLost: staff.leadsLost,
        followUpsDue: staff.followUpsDue,
        followUpsCompleted: staff.followUpsCompleted,
        quotationsSent: staff.quotationsSent,
        quotationsWon: staff.quotationsWon,
        quotationsLost: staff.quotationsLost,
        revenueMinor: staff.revenueMinor,
        salesTargetMinor: staff.salesTargetMinor,
        leadConversionBps: staff.leadConversionBps,
        followUpCompletionBps: staff.followUpCompletionBps,
        salesAchievementBps: staff.salesAchievementBps,
        quotationConversionBps: staff.quotationConversionBps,
      }),
      targets,
      widgets: {
        leads: board.widgets.leads,
        follow_ups: board.widgets.follow_ups,
        quotations: board.widgets.quotations,
        orders: board.widgets.orders,
        sales: board.widgets.sales,
      },
    };
  }

  async report(actor: AuthUser) {
    return this.overview(actor);
  }

  private toWidgetView(input: {
    code: DashboardWidgetCode;
    primary: number;
    primaryLabel: string;
    previous: number;
    month: number;
    metrics: Array<{ code: string; label: string; value: number }>;
    series: SeriesPoint[];
    mix: MixSlice[];
  }): DashboardWidgetView {
    const title = DASHBOARD_WIDGET_CATALOG.find((item) => item.code === input.code)?.title ?? input.code;
    return {
      code: input.code,
      title,
      primary: input.primary,
      primaryLabel: input.primaryLabel,
      previous: input.previous,
      deltaBps: deltaBps(input.primary, input.previous),
      month: input.month,
      metrics: input.metrics,
      series: input.series,
      mix: input.mix.filter((item) => item.value > 0),
    };
  }

  private async tenantZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'Asia/Kolkata';
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }
}
