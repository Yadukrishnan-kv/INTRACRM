// Lead, follow-up, quotation and sales reports (mobile lib/features/reports + quotations).
import { Badge } from '../../components/ui';
import { formatBps, formatCount, formatMoney, humanize } from '../../lib/format';
import type { FollowUpReport, LeadReport, QuotationReport, SalesReport } from './types';
import {
  BreakdownTable,
  DateRangeFilter,
  ExportButtons,
  FilterBar,
  MetricGrid,
  MetricWall,
  ReportPage,
  StaffFilter,
  useReport,
  useReportFilters,
} from './kit';

export function LeadReportPage() {
  const filters = useReportFilters('instant', ['ownerMembershipId']);
  const result = useReport<LeadReport>('/reports/leads', filters.query);
  return (
    <ReportPage
      title="Lead report"
      result={result}
      rangeFilters={filters}
      actions={<ExportButtons dataset="leads" query={filters.query} />}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="ownerMembershipId" label="All owners" />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Open', value: formatCount(r.totals.open), tone: 'info' },
              { label: 'Won', value: formatCount(r.totals.won), tone: 'success' },
              { label: 'Lost', value: formatCount(r.totals.lost), tone: 'danger' },
              { label: 'Unassigned', value: formatCount(r.totals.unassigned), tone: r.totals.unassigned ? 'warning' : undefined },
              { label: 'Pipeline value', value: formatMoney(r.totals.estimatedValueMinor) },
              { label: 'Won value', value: formatMoney(r.totals.wonValueMinor) },
              { label: 'Win rate', value: formatBps(r.totals.winRateBps) },
            ]}
          />
          <div className="grid-2">
            <BreakdownTable
              title="By lifecycle"
              rows={r.byLifecycle}
              rowKey={(x) => x.status}
              bar={(x) => x.count}
              columns={[
                { header: 'Status', cell: (x) => <Badge value={x.status} /> },
                { header: 'Leads', cell: (x) => formatCount(x.count), num: true },
                { header: 'Value', cell: (x) => formatMoney(x.valueMinor), num: true },
              ]}
            />
            <BreakdownTable
              title="By quality"
              rows={r.byQuality}
              rowKey={(x) => x.quality}
              bar={(x) => x.count}
              columns={[
                { header: 'Quality', cell: (x) => humanize(x.quality) },
                { header: 'Leads', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
          </div>
          <BreakdownTable
            title="By source"
            rows={r.bySource}
            rowKey={(x, i) => x.sourceId ?? `none-${i}`}
            bar={(x) => x.count}
            columns={[
              { header: 'Source', cell: (x) => x.name ?? 'Unknown' },
              { header: 'Leads', cell: (x) => formatCount(x.count), num: true },
              { header: 'Value', cell: (x) => formatMoney(x.valueMinor), num: true },
            ]}
          />
          <BreakdownTable
            title="By owner"
            rows={r.byOwner}
            rowKey={(x, i) => x.membershipId ?? `none-${i}`}
            bar={(x) => x.total}
            columns={[
              { header: 'Owner', cell: (x) => x.name ?? 'Unassigned' },
              { header: 'Total', cell: (x) => formatCount(x.total), num: true },
              { header: 'Open', cell: (x) => formatCount(x.open), num: true },
              { header: 'Won', cell: (x) => formatCount(x.won), num: true },
              { header: 'Lost', cell: (x) => formatCount(x.lost), num: true },
              { header: 'Value', cell: (x) => formatMoney(x.valueMinor), num: true },
            ]}
          />
          <div className="grid-2">
            <BreakdownTable
              title="By stage"
              rows={r.byStage ?? []}
              rowKey={(x, i) => x.stageId ?? `${x.stageName}-${i}`}
              bar={(x) => x.count}
              columns={[
                { header: 'Stage', cell: (x) => x.stageName },
                { header: 'Leads', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
            {r.byCity?.length ? (
              <BreakdownTable
                title="By city"
                rows={r.byCity}
                rowKey={(x) => x.city}
                bar={(x) => x.count}
                columns={[
                  { header: 'City', cell: (x) => x.city },
                  { header: 'Leads', cell: (x) => formatCount(x.count), num: true },
                ]}
              />
            ) : null}
          </div>
        </>
      )}
    </ReportPage>
  );
}

export function FollowUpReportPage() {
  const filters = useReportFilters('instant', ['assignedToMembershipId']);
  const result = useReport<FollowUpReport>('/reports/follow-ups', filters.query);
  return (
    <ReportPage
      title="Follow-up report"
      result={result}
      rangeFilters={filters}
      actions={<ExportButtons dataset="follow-ups" query={filters.query} />}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="assignedToMembershipId" label="All assignees" />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Pending', value: formatCount(r.totals.pending), tone: 'warning' },
              { label: 'Completed', value: formatCount(r.totals.completed), tone: 'success' },
              { label: 'Overdue', value: formatCount(r.totals.overdue), tone: r.totals.overdue ? 'danger' : undefined },
              { label: 'Today', value: formatCount(r.totals.today) },
              { label: 'Upcoming', value: formatCount(r.totals.upcoming) },
              { label: 'Rescheduled', value: formatCount(r.totals.rescheduled) },
              { label: 'Completion', value: formatBps(r.totals.completionRateBps) },
            ]}
          />
          <div className="grid-2">
            <BreakdownTable
              title="By status"
              rows={r.byStatus}
              rowKey={(x) => x.status}
              bar={(x) => x.count}
              columns={[
                { header: 'Status', cell: (x) => <Badge value={x.status} /> },
                { header: 'Follow-ups', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
            <BreakdownTable
              title="By type"
              rows={r.byType}
              rowKey={(x) => x.type}
              bar={(x) => x.count}
              columns={[
                { header: 'Type', cell: (x) => humanize(x.type) },
                { header: 'Total', cell: (x) => formatCount(x.count), num: true },
                { header: 'Completed', cell: (x) => formatCount(x.completed), num: true },
              ]}
            />
          </div>
          <BreakdownTable
            title="By assignee"
            rows={r.byAssignee}
            rowKey={(x) => x.membershipId}
            bar={(x) => x.total}
            columns={[
              { header: 'Assignee', cell: (x) => x.name ?? x.membershipId },
              { header: 'Total', cell: (x) => formatCount(x.total), num: true },
              { header: 'Pending', cell: (x) => formatCount(x.pending), num: true },
              { header: 'Done', cell: (x) => formatCount(x.completed), num: true },
              { header: 'Overdue', cell: (x) => formatCount(x.overdue), num: true },
            ]}
          />
        </>
      )}
    </ReportPage>
  );
}

export function QuotationReportPage() {
  const filters = useReportFilters('instant', ['assignedToMembershipId']);
  const result = useReport<QuotationReport>('/reports/quotations', filters.query);
  return (
    <ReportPage
      title="Quotation report"
      result={result}
      rangeFilters={filters}
      actions={<ExportButtons dataset="quotations" query={filters.query} />}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="assignedToMembershipId" label="All assignees" />
        </FilterBar>
      }
    >
      {(r) => {
        const t = r.totals;
        return (
          <>
            <MetricWall
              title="Quotation breakdown"
              items={[
                { label: 'Total', value: formatCount(t.total) },
                { label: 'Won', value: formatCount(t.won), tone: 'success' },
                { label: 'Lost', value: formatCount(t.lost), tone: 'danger' },
                { label: 'Win rate', value: formatBps(t.winRateBps) },
                { label: 'Open value', value: formatMoney(t.openValueMinor) },
                { label: 'Won value', value: formatMoney(t.wonValueMinor) },
                { label: 'Draft', value: formatCount(t.draft) },
                { label: 'Sent', value: formatCount(t.sent) },
                { label: 'Follow-up', value: formatCount(t.followUp) },
                { label: 'Deciding', value: formatCount(t.customerDeciding) },
                { label: 'Negotiation', value: formatCount(t.negotiation) },
                { label: 'Approved', value: formatCount(t.approved) },
                { label: 'Lost value', value: formatMoney(t.lostValueMinor) },
                { label: 'Pending', value: formatCount(t.pending) },
                { label: 'Pending value', value: formatMoney(t.pendingValueMinor) },
                { label: 'Overdue reminders', value: formatCount(t.overdueReminders), tone: t.overdueReminders ? 'danger' : undefined },
                { label: 'Closing soon', value: formatCount(t.closingSoon), tone: 'warning' },
                { label: 'Closing overdue', value: formatCount(t.closingOverdue), tone: t.closingOverdue ? 'danger' : undefined },
                { label: 'No reminder', value: formatCount(t.noFollowUp) },
                { label: 'Avg close chance', value: formatBps(t.averagePredictionBps) },
              ]}
            />
            <BreakdownTable
              title="By status"
              rows={r.byStatus}
              rowKey={(x) => x.status}
              bar={(x) => x.count}
              columns={[
                { header: 'Status', cell: (x) => <Badge value={x.status} /> },
                { header: 'Quotations', cell: (x) => formatCount(x.count), num: true },
                { header: 'Value', cell: (x) => formatMoney(x.valueMinor), num: true },
              ]}
            />
            <BreakdownTable
              title="By assignee"
              rows={r.byAssignee}
              rowKey={(x, i) => x.membershipId ?? `none-${i}`}
              bar={(x) => x.total}
              columns={[
                { header: 'Assignee', cell: (x) => x.name ?? x.membershipId ?? 'Unassigned' },
                { header: 'Total', cell: (x) => formatCount(x.total), num: true },
                { header: 'Won', cell: (x) => formatCount(x.won), num: true },
                { header: 'Lost', cell: (x) => formatCount(x.lost), num: true },
                { header: 'Won value', cell: (x) => formatMoney(x.wonValueMinor), num: true },
              ]}
            />
          </>
        );
      }}
    </ReportPage>
  );
}

export function SalesReportPage() {
  const filters = useReportFilters('instant', ['assignedToMembershipId']);
  const result = useReport<SalesReport>('/reports/sales', filters.query);
  return (
    <ReportPage
      title="Sales report"
      result={result}
      rangeFilters={filters}
      actions={<ExportButtons dataset="sales" query={filters.query} />}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="assignedToMembershipId" label="All salespeople" />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Deals won', value: formatCount(r.totals.deals), tone: 'success' },
              { label: 'Revenue', value: formatMoney(r.totals.revenueMinor) },
              { label: 'Average deal', value: formatMoney(r.totals.averageDealMinor) },
              { label: 'Lost deals', value: formatCount(r.totals.lostDeals), tone: 'danger' },
              { label: 'Lost value', value: formatMoney(r.totals.lostValueMinor) },
              { label: 'Win rate', value: formatBps(r.totals.winRateBps) },
            ]}
          />
          <BreakdownTable
            title="By salesperson"
            rows={r.byAssignee}
            rowKey={(x, i) => x.membershipId ?? `none-${i}`}
            bar={(x) => x.revenueMinor}
            columns={[
              { header: 'Salesperson', cell: (x) => x.name ?? 'Unassigned' },
              { header: 'Won', cell: (x) => formatCount(x.deals), num: true },
              { header: 'Lost', cell: (x) => formatCount(x.lostDeals), num: true },
              { header: 'Revenue', cell: (x) => formatMoney(x.revenueMinor), num: true },
            ]}
          />
          {r.byMonth.length ? (
            <BreakdownTable
              title="By month"
              rows={r.byMonth}
              rowKey={(x) => x.month}
              bar={(x) => x.revenueMinor}
              columns={[
                { header: 'Month', cell: (x) => x.month },
                { header: 'Deals', cell: (x) => formatCount(x.deals), num: true },
                { header: 'Revenue', cell: (x) => formatMoney(x.revenueMinor), num: true },
              ]}
            />
          ) : null}
        </>
      )}
    </ReportPage>
  );
}
