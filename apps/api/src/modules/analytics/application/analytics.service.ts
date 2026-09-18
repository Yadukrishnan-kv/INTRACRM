import { HttpStatus, Injectable } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import type { MixSlice } from '../../dashboard/domain/dashboard-metrics';
import { buildSeries, deltaBps, trailingDays } from '../../dashboard/domain/dashboard-metrics';
import { QUOTATION_STATUS_LABELS, QuotationStatusCode } from '../../quotations/domain/quotation-types';
import { toMinorNumber } from '../../crm-leads/domain/lead-validation';
import { formatYmd, startOfNextZonedDay, startOfZonedDay } from '../../tasks/domain/zoned-day';
import { monthBoundsFromYmd, periodLabel, periodRangeUtc } from '../../targets/domain/target-period';
import {
  ANALYTICS_METRIC_CATALOG,
  AnalyticsMetricCode,
  AnalyticsWidgetView,
  FunnelView,
  PipelineStageRef,
  TimestampedId,
  buildFunnel,
  firstTouchInRange,
  isAnalyticsMetricCode,
  qualifiedStageIds,
  toAnalyticsWidget,
  uniqueCount,
} from '../domain/funnel-metrics';
import { buildFunnelReport, type FunnelReportView } from '../domain/funnel-report';

const WEEK_DAYS = 7;
const SERIES_CAP = 5000;

type Range = { gte: Date; lt: Date };

export type AnalyticsDashboard = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: { start: string; end: string; label: string };
  funnel: FunnelView & {
    today: FunnelView;
    month: FunnelView;
  };
  widgets: Record<AnalyticsMetricCode, AnalyticsWidgetView>;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return { metrics: ANALYTICS_METRIC_CATALOG };
  }

  async overview(actor: AuthUser, membershipId?: string): Promise<AnalyticsDashboard> {
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
    const windowStart = [monthWindow.gte, weekWindow.gte, yesterdayRange.gte].reduce((min, date) =>
      date < min ? date : min,
    );
    const ownedLead = membershipId
      ? { deletedAt: null, ownerMembershipId: membershipId }
      : { deletedAt: null };
    const leadOwner = membershipId ? { ownerMembershipId: membershipId } : {};
    const assignee = membershipId ? { assignedToMembershipId: membershipId } : {};

    const stages = await this.prisma.pipelineStage.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        pipelineId: true,
        code: true,
        name: true,
        sortOrder: true,
        winProbabilityBps: true,
        isWon: true,
        isLost: true,
      },
    });
    const qualifiedIds = [...qualifiedStageIds(stages as PipelineStageRef[])];
    const stageName = new Map(stages.map((stage) => [stage.id, stage.name]));

    const [leadsCreated, qualifiedChanges, quotationsCreated, quotationsWon] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: windowStart, lt: todayEnd },
          ...leadOwner,
        },
        select: {
          id: true,
          createdAt: true,
          sourceId: true,
          source: { select: { name: true } },
        },
        take: SERIES_CAP,
      }),
      qualifiedIds.length === 0
        ? Promise.resolve([])
        : this.prisma.leadStageChange.findMany({
            where: {
              tenantId,
              toStageId: { in: qualifiedIds },
              changedAt: { gte: windowStart, lt: todayEnd },
              lead: ownedLead,
            },
            select: { leadId: true, changedAt: true, toStageId: true },
            take: SERIES_CAP,
          }),
      this.prisma.quotation.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: windowStart, lt: todayEnd },
          ...assignee,
        },
        select: { id: true, leadId: true, createdAt: true, status: true, totalMinor: true },
        take: SERIES_CAP,
      }),
      this.prisma.quotation.findMany({
        where: {
          tenantId,
          deletedAt: null,
          wonAt: { gte: windowStart, lt: todayEnd },
          ...assignee,
        },
        select: { id: true, leadId: true, wonAt: true, totalMinor: true },
        take: SERIES_CAP,
      }),
    ]);

    const windowLeadIds = [...new Set(qualifiedChanges.map((row) => row.leadId))];
    const earlierQualified =
      qualifiedIds.length === 0 || windowLeadIds.length === 0
        ? []
        : await this.prisma.leadStageChange.findMany({
            where: {
              tenantId,
              toStageId: { in: qualifiedIds },
              changedAt: { lt: windowStart },
              leadId: { in: windowLeadIds },
              lead: ownedLead,
            },
            select: { leadId: true },
            distinct: ['leadId'],
          });
    const earlierIds = earlierQualified.map((row) => row.leadId);
    const qualifiedTouches: TimestampedId[] = qualifiedChanges.map((row) => ({
      id: row.leadId,
      at: row.changedAt,
    }));
    const qualifiedToday = firstTouchInRange(qualifiedTouches, earlierIds, today);
    const qualifiedYesterday = firstTouchInRange(qualifiedTouches, earlierIds, yesterdayRange);
    const qualifiedMonth = firstTouchInRange(qualifiedTouches, earlierIds, monthWindow);
    const qualifiedWeek = firstTouchInRange(qualifiedTouches, earlierIds, weekWindow);

    const leadsToday = leadsCreated.filter((row) => row.createdAt >= today.gte && row.createdAt < today.lt);
    const leadsYesterday = leadsCreated.filter(
      (row) => row.createdAt >= yesterdayRange.gte && row.createdAt < yesterdayRange.lt,
    );
    const leadsMonth = leadsCreated.filter(
      (row) => row.createdAt >= monthWindow.gte && row.createdAt < monthWindow.lt,
    );
    const quotesToday = quotationsCreated.filter(
      (row) => row.createdAt >= today.gte && row.createdAt < today.lt,
    );
    const quotesYesterday = quotationsCreated.filter(
      (row) => row.createdAt >= yesterdayRange.gte && row.createdAt < yesterdayRange.lt,
    );
    const quotesMonth = quotationsCreated.filter(
      (row) => row.createdAt >= monthWindow.gte && row.createdAt < monthWindow.lt,
    );
    const wonToday = quotationsWon.filter(
      (row) => row.wonAt && row.wonAt >= today.gte && row.wonAt < today.lt,
    );
    const wonYesterday = quotationsWon.filter(
      (row) => row.wonAt && row.wonAt >= yesterdayRange.gte && row.wonAt < yesterdayRange.lt,
    );
    const wonMonth = quotationsWon.filter(
      (row) => row.wonAt && row.wonAt >= monthWindow.gte && row.wonAt < monthWindow.lt,
    );

    const countsFor = (input: {
      leads: number;
      qualified: number;
      quotations: number;
      quotedLeads: number;
      won: number;
    }) => buildFunnel(input);

    const todayFunnel = countsFor({
      leads: leadsToday.length,
      qualified: qualifiedToday.length,
      quotations: quotesToday.length,
      quotedLeads: uniqueCount(quotesToday.map((row) => row.leadId)),
      won: wonToday.length,
    });
    const yesterdayFunnel = countsFor({
      leads: leadsYesterday.length,
      qualified: qualifiedYesterday.length,
      quotations: quotesYesterday.length,
      quotedLeads: uniqueCount(quotesYesterday.map((row) => row.leadId)),
      won: wonYesterday.length,
    });
    const monthFunnel = countsFor({
      leads: leadsMonth.length,
      qualified: qualifiedMonth.length,
      quotations: quotesMonth.length,
      quotedLeads: uniqueCount(quotesMonth.map((row) => row.leadId)),
      won: wonMonth.length,
    });

    const sourceMix = this.countMix(
      leadsMonth.map((row) => ({
        code: row.sourceId ?? 'unknown',
        label: row.source?.name ?? 'Unknown',
      })),
    );
    const qualifiedMix = this.countMix(
      qualifiedMonth.map((row) => {
        const change = qualifiedChanges.find(
          (item) => item.leadId === row.id && item.changedAt.getTime() === row.at.getTime(),
        );
        const stageId = change?.toStageId ?? 'qualified';
        return { code: stageId, label: stageName.get(stageId) ?? 'Qualified' };
      }),
    );
    const quotationMix = this.countMix(
      quotesMonth.map((row) => ({
        code: row.status,
        label: QUOTATION_STATUS_LABELS[row.status as QuotationStatusCode] ?? row.status,
      })),
    );
    const wonValueMonth = wonMonth.reduce((sum, row) => sum + Number(row.totalMinor), 0);
    const wonValueToday = wonToday.reduce((sum, row) => sum + Number(row.totalMinor), 0);
    const conversionMix: MixSlice[] = [
      { code: 'lead_to_qualified', label: 'Lead → Qualified', value: monthFunnel.conversion.leadToQualifiedBps ?? 0 },
      {
        code: 'qualified_to_quotation',
        label: 'Qualified → Quotation',
        value: monthFunnel.conversion.qualifiedToQuotationBps ?? 0,
      },
      { code: 'quotation_to_won', label: 'Quotation → Won', value: monthFunnel.conversion.quotationToWonBps ?? 0 },
      { code: 'overall', label: 'Overall', value: monthFunnel.conversion.overallBps ?? 0 },
    ];

    const widgets: Record<AnalyticsMetricCode, AnalyticsWidgetView> = {
      leads: toAnalyticsWidget({
        code: 'leads',
        primary: leadsToday.length,
        primaryLabel: 'Today',
        previous: leadsYesterday.length,
        deltaBps: deltaBps(leadsToday.length, leadsYesterday.length),
        month: leadsMonth.length,
        metrics: [
          { code: 'month', label: 'This month', value: leadsMonth.length },
          { code: 'sources', label: 'Sources', value: sourceMix.length },
        ],
        series: buildSeries(
          weekDays,
          leadsCreated.map((row) => ({ at: row.createdAt })),
          timeZone,
        ),
        mix: sourceMix,
      }),
      qualified: toAnalyticsWidget({
        code: 'qualified',
        primary: qualifiedToday.length,
        primaryLabel: 'Today',
        previous: qualifiedYesterday.length,
        deltaBps: deltaBps(qualifiedToday.length, qualifiedYesterday.length),
        month: qualifiedMonth.length,
        metrics: [
          { code: 'month', label: 'This month', value: qualifiedMonth.length },
          { code: 'rate_bps', label: 'Of leads (month)', value: monthFunnel.conversion.leadToQualifiedBps ?? 0 },
        ],
        series: buildSeries(
          weekDays,
          qualifiedWeek.map((row) => ({ at: row.at })),
          timeZone,
        ),
        mix: qualifiedMix,
      }),
      quotations: toAnalyticsWidget({
        code: 'quotations',
        primary: quotesToday.length,
        primaryLabel: 'Today',
        previous: quotesYesterday.length,
        deltaBps: deltaBps(quotesToday.length, quotesYesterday.length),
        month: quotesMonth.length,
        metrics: [
          { code: 'month', label: 'This month', value: quotesMonth.length },
          { code: 'leads', label: 'Leads quoted', value: uniqueCount(quotesMonth.map((row) => row.leadId)) },
          {
            code: 'draft',
            label: 'Draft',
            value: quotesMonth.filter((row) => row.status === QuotationStatus.draft).length,
          },
        ],
        series: buildSeries(
          weekDays,
          quotationsCreated.map((row) => ({ at: row.createdAt })),
          timeZone,
        ),
        mix: quotationMix,
      }),
      won: toAnalyticsWidget({
        code: 'won',
        primary: wonToday.length,
        primaryLabel: 'Today',
        previous: wonYesterday.length,
        deltaBps: deltaBps(wonToday.length, wonYesterday.length),
        month: wonMonth.length,
        metrics: [
          { code: 'month', label: 'This month', value: wonMonth.length },
          { code: 'revenue_today', label: 'Revenue today', value: wonValueToday },
          { code: 'revenue_month', label: 'Revenue month', value: wonValueMonth },
        ],
        series: buildSeries(
          weekDays,
          quotationsWon.flatMap((row) => (row.wonAt ? [{ at: row.wonAt }] : [])),
          timeZone,
        ),
        mix: [
          { code: 'won', label: 'Won', value: wonMonth.length },
          { code: 'quoted', label: 'Quoted', value: quotesMonth.length },
        ],
      }),
      conversion: toAnalyticsWidget({
        code: 'conversion',
        primary: todayFunnel.conversion.overallBps ?? 0,
        primaryLabel: 'Today',
        previous: yesterdayFunnel.conversion.overallBps ?? 0,
        deltaBps: deltaBps(todayFunnel.conversion.overallBps ?? 0, yesterdayFunnel.conversion.overallBps ?? 0),
        month: monthFunnel.conversion.overallBps ?? 0,
        metrics: [
          { code: 'lead_to_qualified_bps', label: 'Lead → Qualified', value: monthFunnel.conversion.leadToQualifiedBps ?? 0 },
          {
            code: 'qualified_to_quotation_bps',
            label: 'Qualified → Quotation',
            value: monthFunnel.conversion.qualifiedToQuotationBps ?? 0,
          },
          { code: 'quotation_to_won_bps', label: 'Quotation → Won', value: monthFunnel.conversion.quotationToWonBps ?? 0 },
          { code: 'overall_bps', label: 'Overall (month)', value: monthFunnel.conversion.overallBps ?? 0 },
        ],
        series: weekDays.map((date) => {
          const dayRange = periodRangeUtc(date, date, timeZone);
          const range: Range = { gte: dayRange.from, lt: dayRange.toExclusive };
          const dayLeads = leadsCreated.filter((row) => row.createdAt >= range.gte && row.createdAt < range.lt).length;
          const dayWon = quotationsWon.filter(
            (row) => row.wonAt && row.wonAt >= range.gte && row.wonAt < range.lt,
          ).length;
          const value = dayLeads <= 0 ? 0 : Math.round((dayWon / dayLeads) * 10000);
          return { date, label: String(Number(date.slice(8, 10))), value };
        }),
        mix: conversionMix.filter((item) => item.value > 0),
      }),
    };

    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      today: todayYmd,
      month: {
        start: month.start,
        end: month.end,
        label: periodLabel('monthly', month.start, month.end),
      },
      funnel: {
        ...todayFunnel,
        today: todayFunnel,
        month: monthFunnel,
      },
      widgets,
    };
  }

  async widget(actor: AuthUser, code: string) {
    if (!isAnalyticsMetricCode(code)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Unknown analytics metric', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const board = await this.overview(actor);
    return {
      generatedAt: board.generatedAt,
      timezone: board.timezone,
      today: board.today,
      month: board.month,
      funnel: board.funnel,
      widget: board.widgets[code],
    };
  }

  async mine(actor: AuthUser) {
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    return this.overview(actor, actor.membershipId);
  }

  async report(actor: AuthUser, membershipId?: string) {
    return this.overview(actor, membershipId);
  }

  async funnelReport(actor: AuthUser, membershipId?: string): Promise<
    FunnelReportView & {
      generatedAt: string;
      timezone: string;
      today: string;
      month: { start: string; end: string; label: string };
    }
  > {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const todayYmd = formatYmd(now, timeZone);
    const weekDays = trailingDays(todayYmd, WEEK_DAYS);
    const month = monthBoundsFromYmd(todayYmd);
    const ownedLead = membershipId
      ? { deletedAt: null, ownerMembershipId: membershipId }
      : { deletedAt: null };
    const leadOwner = membershipId ? { ownerMembershipId: membershipId } : {};

    const [stages, leads, changes] = await Promise.all([
      this.prisma.pipelineStage.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          pipelineId: true,
          code: true,
          name: true,
          sortOrder: true,
          winProbabilityBps: true,
          isWon: true,
          isLost: true,
        },
      }),
      this.prisma.lead.findMany({
        where: { tenantId, deletedAt: null, ...leadOwner },
        select: { id: true, stageId: true, estimatedValueMinor: true, createdAt: true },
        take: SERIES_CAP,
      }),
      this.prisma.leadStageChange.findMany({
        where: { tenantId, lead: ownedLead },
        select: { leadId: true, toStageId: true, changedAt: true },
        take: SERIES_CAP * 3,
      }),
    ]);

    const report = buildFunnelReport({
      stages: stages as PipelineStageRef[],
      leads: leads.map((lead) => ({
        id: lead.id,
        stageId: lead.stageId,
        valueMinor: toMinorNumber(lead.estimatedValueMinor) ?? 0,
        createdAt: lead.createdAt,
      })),
      changes: changes.map((change) => ({
        id: change.leadId,
        leadId: change.leadId,
        toStageId: change.toStageId,
        at: change.changedAt,
      })),
      days: weekDays,
      timeZone,
    });

    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      today: todayYmd,
      month: {
        start: month.start,
        end: month.end,
        label: periodLabel('monthly', month.start, month.end),
      },
      ...report,
    };
  }

  async mineFunnel(actor: AuthUser) {
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    return this.funnelReport(actor, actor.membershipId);
  }

  private countMix(rows: Array<{ code: string; label: string }>): MixSlice[] {
    const totals = new Map<string, MixSlice>();
    for (const row of rows) {
      const current = totals.get(row.code);
      if (current) {
        current.value += 1;
        continue;
      }
      totals.set(row.code, { code: row.code, label: row.label, value: 1 });
    }
    return [...totals.values()].sort((left, right) => right.value - left.value);
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
