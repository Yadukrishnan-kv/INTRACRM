import { csvEscape, renderCsv } from './export-csv';
import { renderPdf } from './export-pdf';
import { renderXlsx } from './export-xlsx';
import {
  followUpExportDocument,
  leadExportDocument,
  performanceExportDocument,
  quotationExportDocument,
  salesExportDocument,
  analyticsExportDocument,
  funnelExportDocument,
  tracksExportDocument,
} from './report-export-tables';
import { LeadReportView } from '../../crm-leads/domain/lead-report';

const sample: LeadReportView = {
  generatedAt: '2026-08-16T00:00:00.000Z',
  totals: {
    total: 2,
    open: 1,
    won: 1,
    lost: 0,
    unqualified: 0,
    recycled: 0,
    unassigned: 0,
    estimatedValueMinor: 35000,
    wonValueMinor: 25000,
    winRateBps: 10000,
  },
  byLifecycle: [{ status: 'open', count: 1, valueMinor: 10000 }],
  byQuality: [{ quality: 'hot', count: 1 }],
  bySource: [{ sourceId: 's1', name: 'Website', count: 2, valueMinor: 35000 }],
  byOwner: [
    {
      membershipId: 'm1',
      name: 'Asha',
      total: 2,
      open: 1,
      won: 1,
      lost: 0,
      valueMinor: 35000,
    },
  ],
  byStage: [{ stageName: 'New', count: 1, valueMinor: 10000 }],
  byCity: [{ city: 'Pune', count: 2 }],
};

describe('report exports', () => {
  it('escapes CSV fields and includes a BOM', () => {
    expect(csvEscape('Asha, Rao')).toBe('"Asha, Rao"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
    const csv = renderCsv(leadExportDocument(sample)).toString('utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Lead report');
    expect(csv).toContain('By owner');
    expect(csv).toContain('Asha');
    expect(csv).toContain('100.00');
  });

  it('builds lead export tables from the report view', () => {
    const doc = leadExportDocument(sample);
    expect(doc.fileStem).toBe('lead-report');
    expect(doc.tables[0]?.name).toBe('Totals');
    expect(doc.tables.some((table) => table.name === 'By source')).toBe(true);
  });

  it('renders Excel and PDF binaries', async () => {
    const doc = leadExportDocument(sample);
    const xlsx = await renderXlsx(doc);
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    const pdf = await renderPdf(doc);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('builds follow-up, quotation, sales, and performance tables', () => {
    const generatedAt = '2026-08-16T00:00:00.000Z';
    expect(
      followUpExportDocument({
        generatedAt,
        totals: {
          total: 1,
          pending: 1,
          completed: 0,
          cancelled: 0,
          skipped: 0,
          overdue: 0,
          today: 1,
          upcoming: 0,
          rescheduled: 0,
          completionRateBps: 0,
        },
        byStatus: [{ status: 'pending', count: 1 }],
        byType: [{ type: 'call', count: 1, completed: 0 }],
        byAssignee: [
          { membershipId: 'm1', name: 'Asha', total: 1, pending: 1, completed: 0, overdue: 0 },
        ],
      }).fileStem,
    ).toBe('follow-up-report');
    expect(
      quotationExportDocument({
        generatedAt,
        totals: {
          total: 1,
          draft: 0,
          sent: 1,
          followUp: 0,
          customerDeciding: 0,
          negotiation: 0,
          approved: 0,
          won: 0,
          lost: 0,
          openValueMinor: 10000,
          wonValueMinor: 0,
          lostValueMinor: 0,
          winRateBps: null,
          pending: 1,
          pendingValueMinor: 10000,
          overdueReminders: 0,
          closingSoon: 0,
          closingOverdue: 0,
          noFollowUp: 0,
          averagePredictionBps: null,
        },
        byStatus: [{ status: 'sent', count: 1, valueMinor: 10000 }],
        byAssignee: [
          { membershipId: 'm1', name: 'Asha', total: 1, won: 0, lost: 0, wonValueMinor: 0 },
        ],
      }).title,
    ).toBe('Quotation report');
    expect(
      salesExportDocument({
        generatedAt,
        totals: {
          deals: 1,
          revenueMinor: 25000,
          averageDealMinor: 25000,
          lostDeals: 0,
          lostValueMinor: 0,
          closedDeals: 1,
          winRateBps: 10000,
        },
        byAssignee: [
          { membershipId: 'm1', name: 'Asha', deals: 1, revenueMinor: 25000, lostDeals: 0 },
        ],
        byMonth: [{ month: '2026-08', deals: 1, revenueMinor: 25000 }],
      }).fileStem,
    ).toBe('sales-report');
    const performance = performanceExportDocument({
      generatedAt,
      period: { label: 'August 2026' },
      totals: {
        staff: 1,
        scored: 1,
        averageScoreBps: 8000,
        outstanding: 0,
        strong: 1,
        average: 0,
        needsWork: 0,
        noData: 0,
      },
      top: [
        {
          membershipId: 'm1',
          name: 'Asha',
          designation: null,
          teamId: null,
          teamName: null,
          leadsCreated: 1,
          leadsWon: 1,
          leadsLost: 0,
          followUpsDue: 1,
          followUpsCompleted: 1,
          quotationsSent: 1,
          quotationsWon: 1,
          quotationsLost: 0,
          revenueMinor: 25000,
          salesTargetMinor: null,
          leadConversionBps: 10000,
          followUpCompletionBps: 10000,
          salesAchievementBps: null,
          quotationConversionBps: 10000,
          scoreBps: 8000,
          scoreBand: 'strong',
          rank: 1,
          teamRank: null,
          rankedOutOf: 1,
        },
      ],
      byTeam: [{ teamName: 'Pune', count: 1, averageScoreBps: 8000 }],
    });
    expect(performance.title).toContain('August 2026');
    expect(performance.tables[0]?.rows.some((row) => row[0] === 'No data')).toBe(true);
    expect(
      analyticsExportDocument({
        generatedAt,
        today: '2026-08-16',
        month: { label: 'August 2026' },
        funnel: {
          today: {
            steps: [
              { label: 'Leads', value: 8, conversionFromPreviousBps: 10000 },
              { label: 'Qualified', value: 4, conversionFromPreviousBps: 5000 },
              { label: 'Quotations', value: 2, conversionFromPreviousBps: 5000 },
              { label: 'Won', value: 1, conversionFromPreviousBps: 5000 },
            ],
            conversion: {
              leadToQualifiedBps: 5000,
              qualifiedToQuotationBps: 5000,
              quotationToWonBps: 5000,
              overallBps: 1250,
            },
          },
          month: {
            steps: [
              { label: 'Leads', value: 40, conversionFromPreviousBps: 10000 },
              { label: 'Qualified', value: 20, conversionFromPreviousBps: 5000 },
              { label: 'Quotations', value: 10, conversionFromPreviousBps: 5000 },
              { label: 'Won', value: 4, conversionFromPreviousBps: 4000 },
            ],
            conversion: {
              leadToQualifiedBps: 5000,
              qualifiedToQuotationBps: 5000,
              quotationToWonBps: 4000,
              overallBps: 1000,
            },
          },
        },
        widgets: {
          leads: { title: 'Leads', primary: 8, month: 40, metrics: [] },
          qualified: { title: 'Qualified', primary: 4, month: 20, metrics: [] },
          quotations: { title: 'Quotations', primary: 2, month: 10, metrics: [] },
          won: { title: 'Won', primary: 1, month: 4, metrics: [] },
          conversion: { title: 'Conversion', primary: 1250, month: 1000, metrics: [] },
        },
      }).fileStem,
    ).toBe('analytics-report');
    expect(
      funnelExportDocument({
        generatedAt,
        month: { label: 'August 2026' },
        conversion: {
          leadToQualifiedBps: 5000,
          qualifiedToQuotationBps: 5000,
          quotationToNegotiationBps: 4000,
          negotiationToWonBps: 5000,
          overallBps: 1000,
        },
        stages: [
          {
            label: 'Lead',
            currentCount: 8,
            reachedCount: 40,
            currentValueMinor: 10000,
            reachedValueMinor: 80000,
            conversionFromPreviousBps: 10000,
            dropOffCount: null,
          },
          {
            label: 'Won',
            currentCount: 1,
            reachedCount: 4,
            currentValueMinor: 25000,
            reachedValueMinor: 40000,
            conversionFromPreviousBps: 5000,
            dropOffCount: 4,
          },
        ],
      }).fileStem,
    ).toBe('funnel-report');
    expect(
      tracksExportDocument({
        generatedAt,
        totals: { total: 4, create: 1, update: 0, delete: 1, assign: 1, statusChange: 1 },
        byAction: [
          { action: 'create', name: 'Create', count: 1 },
          { action: 'update', name: 'Update', count: 0 },
          { action: 'delete', name: 'Delete', count: 1 },
          { action: 'assign', name: 'Assignments', count: 1 },
          { action: 'status_change', name: 'Status Changes', count: 1 },
        ],
        byResource: [{ resourceType: 'lead', count: 3 }],
        byActor: [{ actorId: 'u1', name: 'Asha', count: 2 }],
        byDay: [{ date: '2026-08-16', count: 2 }],
      }).fileStem,
    ).toBe('track-report');
  });
});
