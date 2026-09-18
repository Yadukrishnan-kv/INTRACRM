import { LeadReportView } from '../../crm-leads/domain/lead-report';
import { FollowUpReportView } from '../../tasks/domain/follow-up-report';
import { QuotationReportView } from '../../quotations/domain/quotation-report';
import { SalesReportView } from '../../quotations/domain/sales-report';
import { StaffPerformanceView } from '../../performance/application/performance.service';
import { TrackReportView } from '../../audit/domain/track-events';
import { cell, ExportDocument, percent, rupees, titleCase } from './export-types';

export type PerformanceExportView = {
  generatedAt: string;
  period: { label: string };
  totals: {
    staff: number;
    scored: number;
    averageScoreBps: number | null;
    outstanding: number;
    strong: number;
    average: number;
    needsWork: number;
    noData: number;
  };
  top: StaffPerformanceView[];
  byTeam: Array<{ teamName: string; count: number; averageScoreBps: number | null }>;
};

function metricTable(rows: Array<[string, string]>) {
  return {
    name: 'Totals',
    headers: ['Metric', 'Value'],
    rows,
  };
}

export function leadExportDocument(view: LeadReportView): ExportDocument {
  return {
    title: 'Lead report',
    fileStem: 'lead-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Total', cell(view.totals.total)],
        ['Open', cell(view.totals.open)],
        ['Won', cell(view.totals.won)],
        ['Lost', cell(view.totals.lost)],
        ['Unqualified', cell(view.totals.unqualified)],
        ['Recycled', cell(view.totals.recycled)],
        ['Unassigned', cell(view.totals.unassigned)],
        ['Pipeline value', rupees(view.totals.estimatedValueMinor)],
        ['Won value', rupees(view.totals.wonValueMinor)],
        ['Win rate', percent(view.totals.winRateBps)],
      ]),
      {
        name: 'By lifecycle',
        headers: ['Status', 'Count', 'Value'],
        rows: view.byLifecycle.map((row) => [titleCase(row.status), cell(row.count), rupees(row.valueMinor)]),
      },
      {
        name: 'By quality',
        headers: ['Quality', 'Count'],
        rows: view.byQuality.map((row) => [titleCase(row.quality), cell(row.count)]),
      },
      {
        name: 'By source',
        headers: ['Source', 'Count', 'Value'],
        rows: view.bySource.map((row) => [row.name ?? 'Unknown', cell(row.count), rupees(row.valueMinor)]),
      },
      {
        name: 'By owner',
        headers: ['Owner', 'Total', 'Open', 'Won', 'Lost', 'Value'],
        rows: view.byOwner.map((row) => [
          row.name ?? 'Unassigned',
          cell(row.total),
          cell(row.open),
          cell(row.won),
          cell(row.lost),
          rupees(row.valueMinor),
        ]),
      },
      {
        name: 'By stage',
        headers: ['Stage', 'Count', 'Value'],
        rows: view.byStage.map((row) => [row.stageName, cell(row.count), rupees(row.valueMinor)]),
      },
      {
        name: 'By city',
        headers: ['City', 'Count'],
        rows: view.byCity.map((row) => [row.city, cell(row.count)]),
      },
    ],
  };
}

export function followUpExportDocument(view: FollowUpReportView): ExportDocument {
  return {
    title: 'Follow-up report',
    fileStem: 'follow-up-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Total', cell(view.totals.total)],
        ['Pending', cell(view.totals.pending)],
        ['Completed', cell(view.totals.completed)],
        ['Cancelled', cell(view.totals.cancelled)],
        ['Skipped', cell(view.totals.skipped)],
        ['Overdue', cell(view.totals.overdue)],
        ['Today', cell(view.totals.today)],
        ['Upcoming', cell(view.totals.upcoming)],
        ['Rescheduled', cell(view.totals.rescheduled)],
        ['Completion', percent(view.totals.completionRateBps)],
      ]),
      {
        name: 'By status',
        headers: ['Status', 'Count'],
        rows: view.byStatus.map((row) => [titleCase(row.status), cell(row.count)]),
      },
      {
        name: 'By type',
        headers: ['Type', 'Count', 'Completed'],
        rows: view.byType.map((row) => [titleCase(row.type), cell(row.count), cell(row.completed)]),
      },
      {
        name: 'By assignee',
        headers: ['Assignee', 'Total', 'Pending', 'Completed', 'Overdue'],
        rows: view.byAssignee.map((row) => [
          row.name ?? row.membershipId,
          cell(row.total),
          cell(row.pending),
          cell(row.completed),
          cell(row.overdue),
        ]),
      },
    ],
  };
}

export function quotationExportDocument(view: QuotationReportView): ExportDocument {
  return {
    title: 'Quotation report',
    fileStem: 'quotation-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Total', cell(view.totals.total)],
        ['Draft', cell(view.totals.draft)],
        ['Sent', cell(view.totals.sent)],
        ['Follow-up', cell(view.totals.followUp)],
        ['Deciding', cell(view.totals.customerDeciding)],
        ['Negotiation', cell(view.totals.negotiation)],
        ['Approved', cell(view.totals.approved)],
        ['Won', cell(view.totals.won)],
        ['Lost', cell(view.totals.lost)],
        ['Open value', rupees(view.totals.openValueMinor)],
        ['Won value', rupees(view.totals.wonValueMinor)],
        ['Win rate', percent(view.totals.winRateBps)],
        ['Pending', cell(view.totals.pending)],
        ['Overdue reminders', cell(view.totals.overdueReminders)],
      ]),
      {
        name: 'By status',
        headers: ['Status', 'Count', 'Value'],
        rows: view.byStatus.map((row) => [titleCase(row.status), cell(row.count), rupees(row.valueMinor)]),
      },
      {
        name: 'By assignee',
        headers: ['Assignee', 'Total', 'Won', 'Lost', 'Won value'],
        rows: view.byAssignee.map((row) => [
          row.name ?? 'Unassigned',
          cell(row.total),
          cell(row.won),
          cell(row.lost),
          rupees(row.wonValueMinor),
        ]),
      },
    ],
  };
}

export function salesExportDocument(view: SalesReportView): ExportDocument {
  return {
    title: 'Sales report',
    fileStem: 'sales-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Deals won', cell(view.totals.deals)],
        ['Revenue', rupees(view.totals.revenueMinor)],
        ['Average deal', view.totals.averageDealMinor == null ? '' : rupees(view.totals.averageDealMinor)],
        ['Lost deals', cell(view.totals.lostDeals)],
        ['Lost value', rupees(view.totals.lostValueMinor)],
        ['Win rate', percent(view.totals.winRateBps)],
      ]),
      {
        name: 'By salesperson',
        headers: ['Name', 'Deals', 'Revenue', 'Lost deals'],
        rows: view.byAssignee.map((row) => [
          row.name ?? 'Unassigned',
          cell(row.deals),
          rupees(row.revenueMinor),
          cell(row.lostDeals),
        ]),
      },
      {
        name: 'By month',
        headers: ['Month', 'Deals', 'Revenue'],
        rows: view.byMonth.map((row) => [row.month, cell(row.deals), rupees(row.revenueMinor)]),
      },
    ],
  };
}

export function performanceExportDocument(view: PerformanceExportView): ExportDocument {
  return {
    title: `Staff performance — ${view.period.label}`,
    fileStem: 'performance-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Staff', cell(view.totals.staff)],
        ['Scored', cell(view.totals.scored)],
        ['Average', percent(view.totals.averageScoreBps)],
        ['Outstanding', cell(view.totals.outstanding)],
        ['Strong', cell(view.totals.strong)],
        ['Average', cell(view.totals.average)],
        ['Needs work', cell(view.totals.needsWork)],
        ['No data', cell(view.totals.noData)],
      ]),
      {
        name: 'Leaderboard',
        headers: ['Rank', 'Name', 'Score', 'Band', 'Revenue'],
        rows: view.top.map((row) => [
          cell(row.rank),
          row.name,
          percent(row.scoreBps),
          titleCase(row.scoreBand),
          rupees(row.revenueMinor),
        ]),
      },
      {
        name: 'By team',
        headers: ['Team', 'Staff', 'Average'],
        rows: view.byTeam.map((row) => [row.teamName, cell(row.count), percent(row.averageScoreBps)]),
      },
    ],
  };
}

export type AnalyticsExportView = {
  generatedAt: string;
  today: string;
  month: { label: string };
  funnel: {
    today: {
      steps: Array<{ label: string; value: number; conversionFromPreviousBps: number | null }>;
      conversion: {
        leadToQualifiedBps: number | null;
        qualifiedToQuotationBps: number | null;
        quotationToWonBps: number | null;
        overallBps: number | null;
      };
    };
    month: {
      steps: Array<{ label: string; value: number; conversionFromPreviousBps: number | null }>;
      conversion: {
        leadToQualifiedBps: number | null;
        qualifiedToQuotationBps: number | null;
        quotationToWonBps: number | null;
        overallBps: number | null;
      };
    };
  };
  widgets: Record<
    string,
    {
      title: string;
      primary: number;
      month: number;
      metrics: Array<{ label: string; value: number }>;
    }
  >;
};

export function analyticsExportDocument(view: AnalyticsExportView): ExportDocument {
  const monthConversion = view.funnel.month.conversion;
  return {
    title: `Analytics — ${view.month.label}`,
    fileStem: 'analytics-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Today', view.today],
        ['Period', view.month.label],
        ['Lead → Qualified', percent(monthConversion.leadToQualifiedBps)],
        ['Qualified → Quotation', percent(monthConversion.qualifiedToQuotationBps)],
        ['Quotation → Won', percent(monthConversion.quotationToWonBps)],
        ['Overall conversion', percent(monthConversion.overallBps)],
      ]),
      {
        name: 'Funnel today',
        headers: ['Step', 'Count', 'From previous'],
        rows: view.funnel.today.steps.map((step) => [
          step.label,
          cell(step.value),
          percent(step.conversionFromPreviousBps),
        ]),
      },
      {
        name: 'Funnel this month',
        headers: ['Step', 'Count', 'From previous'],
        rows: view.funnel.month.steps.map((step) => [
          step.label,
          cell(step.value),
          percent(step.conversionFromPreviousBps),
        ]),
      },
      {
        name: 'Metrics',
        headers: ['Metric', 'Today', 'Month'],
        rows: Object.values(view.widgets).map((widget) => [
          widget.title,
          cell(widget.primary),
          cell(widget.month),
        ]),
      },
    ],
  };
}

export type FunnelExportView = {
  generatedAt: string;
  month: { label: string };
  conversion: {
    leadToQualifiedBps: number | null;
    qualifiedToQuotationBps: number | null;
    quotationToNegotiationBps: number | null;
    negotiationToWonBps: number | null;
    overallBps: number | null;
  };
  stages: Array<{
    label: string;
    currentCount: number;
    reachedCount: number;
    currentValueMinor: number;
    reachedValueMinor: number;
    conversionFromPreviousBps: number | null;
    dropOffCount: number | null;
  }>;
};

export function funnelExportDocument(view: FunnelExportView): ExportDocument {
  return {
    title: `Funnel report — ${view.month.label}`,
    fileStem: 'funnel-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Period', view.month.label],
        ['Lead → Qualified', percent(view.conversion.leadToQualifiedBps)],
        ['Qualified → Quotation', percent(view.conversion.qualifiedToQuotationBps)],
        ['Quotation → Negotiation', percent(view.conversion.quotationToNegotiationBps)],
        ['Negotiation → Won', percent(view.conversion.negotiationToWonBps)],
        ['Lead → Won', percent(view.conversion.overallBps)],
      ]),
      {
        name: 'Funnel',
        headers: ['Stage', 'Current', 'Reached', 'Current value', 'Reached value', 'From previous', 'Drop-off'],
        rows: view.stages.map((stage) => [
          stage.label,
          cell(stage.currentCount),
          cell(stage.reachedCount),
          rupees(stage.currentValueMinor),
          rupees(stage.reachedValueMinor),
          percent(stage.conversionFromPreviousBps),
          cell(stage.dropOffCount),
        ]),
      },
    ],
  };
}

export function tracksExportDocument(view: TrackReportView): ExportDocument {
  return {
    title: 'Track report',
    fileStem: 'track-report',
    generatedAt: view.generatedAt,
    tables: [
      metricTable([
        ['Total', cell(view.totals.total)],
        ['Create', cell(view.totals.create)],
        ['Update', cell(view.totals.update)],
        ['Delete', cell(view.totals.delete)],
        ['Assignments', cell(view.totals.assign)],
        ['Status changes', cell(view.totals.statusChange)],
      ]),
      {
        name: 'By action',
        headers: ['Action', 'Count'],
        rows: view.byAction.map((row) => [row.name, cell(row.count)]),
      },
      {
        name: 'By resource',
        headers: ['Resource', 'Count'],
        rows: view.byResource.map((row) => [titleCase(row.resourceType), cell(row.count)]),
      },
      {
        name: 'By actor',
        headers: ['Actor', 'Count'],
        rows: view.byActor.map((row) => [row.name ?? 'System', cell(row.count)]),
      },
      {
        name: 'By day',
        headers: ['Date', 'Count'],
        rows: view.byDay.map((row) => [row.date, cell(row.count)]),
      },
    ],
  };
}
