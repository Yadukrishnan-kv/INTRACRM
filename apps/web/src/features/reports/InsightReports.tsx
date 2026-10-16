// Target, performance, incentive, pipeline-analytics and funnel reports.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge } from '../../components/ui';
import { formatBps, formatCount, formatMoney, humanize } from '../../lib/format';
import { reportsApi } from './api';
import type { FunnelReport, IncentiveReport, PerformanceReport, PipelineAnalytics, TargetReport } from './types';
import {
  Bar,
  BreakdownTable,
  ChipFilter,
  DateRangeFilter,
  ExportButtons,
  FilterBar,
  MetricGrid,
  MetricWall,
  ReportPage,
  Section,
  SelectFilter,
  StaffFilter,
  reportKeys,
  useReport,
  useReportFilters,
  useReportLookups,
} from './kit';
import { barPercent, forecastBandLabel, maxOf, ratioBps, scopeLabel } from './logic';

// ---------------------------------------------------------------- Targets

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

const SCOPE_OPTIONS = ['tenant', 'team', 'membership', 'branch'].map((value) => ({ value, label: scopeLabel(value) }));

const onTrackCell = (x: { onTrack: number; count: number }) => `${formatCount(x.onTrack)} of ${formatCount(x.count)}`;

export function TargetReportPage() {
  const filters = useReportFilters('ymd', ['periodType', 'scopeType']);
  const result = useReport<TargetReport>('/reports/targets', filters.query);
  return (
    <ReportPage
      title="Target report"
      result={result}
      rangeFilters={filters}
      actions={
        <Link className="btn btn-ghost btn-sm" to="/targets">
          Targets
        </Link>
      }
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <SelectFilter filters={filters} param="periodType" label="All periods" options={PERIOD_OPTIONS} />
          <SelectFilter filters={filters} param="scopeType" label="All scopes" options={SCOPE_OPTIONS} />
        </FilterBar>
      }
    >
      {(r) => {
        const t = r.totals;
        return (
          <>
            <MetricWall
              title="Outcomes"
              items={[
                { label: 'Targets', value: formatCount(t.count) },
                { label: 'On track', value: formatCount(t.onTrack), tone: 'success' },
                { label: 'Behind', value: formatCount(t.behind), tone: t.behind ? 'warning' : undefined },
                { label: 'At risk', value: formatCount(t.atRisk), tone: t.atRisk ? 'danger' : undefined },
                { label: 'Achievement', value: formatBps(t.averageAttainmentBps) },
                { label: 'Forecast', value: formatBps(t.averageForecastBps) },
                { label: 'Hit', value: formatCount(t.hit), tone: 'success' },
                { label: 'Missed', value: formatCount(t.missed), tone: t.missed ? 'danger' : undefined },
                { label: 'Ahead', value: formatCount(t.ahead), tone: 'info' },
              ]}
            />
            {r.byForecast.length ? (
              <BreakdownTable
                title="Forecast"
                rows={r.byForecast}
                rowKey={(x, i) => x.band ?? `none-${i}`}
                bar={(x) => x.count}
                columns={[
                  { header: 'Band', cell: (x) => forecastBandLabel(x.band) },
                  { header: 'Targets', cell: (x) => formatCount(x.count), num: true },
                ]}
              />
            ) : null}
            <div className="grid-2">
              <BreakdownTable
                title="By period"
                rows={r.byPeriod}
                rowKey={(x) => x.periodType}
                bar={(x) => x.count}
                columns={[
                  { header: 'Period', cell: (x) => humanize(x.periodType) },
                  { header: 'On track', cell: onTrackCell, num: true },
                  { header: 'Avg', cell: (x) => formatBps(x.averageAttainmentBps), num: true },
                ]}
              />
              <BreakdownTable
                title="By scope"
                rows={r.byScope}
                rowKey={(x) => x.scopeType}
                bar={(x) => x.count}
                columns={[
                  { header: 'Scope', cell: (x) => scopeLabel(x.scopeType) },
                  { header: 'On track', cell: onTrackCell, num: true },
                  { header: 'Avg', cell: (x) => formatBps(x.averageAttainmentBps), num: true },
                ]}
              />
            </div>
            <BreakdownTable
              title="By metric"
              rows={r.byMetric}
              rowKey={(x) => x.metricCode}
              bar={(x) => x.count}
              columns={[
                { header: 'Metric', cell: (x) => x.metricName ?? x.metricCode },
                { header: 'Targets', cell: (x) => formatCount(x.count), num: true },
                { header: 'Target', cell: (x) => formatCount(x.targetValue), num: true },
                { header: 'Achieved', cell: (x) => formatCount(x.achievedValue), num: true },
                { header: 'Balance', cell: (x) => formatCount(x.balance), num: true },
              ]}
            />
            {r.teams.length ? (
              <BreakdownTable
                title="Teams"
                rows={r.teams}
                rowKey={(x, i) => x.scopeId ?? `team-${i}`}
                bar={(x) => x.onTrack}
                columns={[
                  { header: 'Team', cell: (x) => x.scopeName ?? 'Team' },
                  { header: 'On track', cell: onTrackCell, num: true },
                  { header: 'Avg', cell: (x) => formatBps(x.averageAttainmentBps), num: true },
                ]}
              />
            ) : null}
            {r.products.length ? (
              <BreakdownTable
                title="Products"
                rows={r.products}
                rowKey={(x) => x.productId}
                bar={(x) => x.onTrack}
                columns={[
                  { header: 'Product', cell: (x) => x.productName ?? 'Product' },
                  { header: 'On track', cell: onTrackCell, num: true },
                  { header: 'Avg', cell: (x) => formatBps(x.averageAttainmentBps), num: true },
                ]}
              />
            ) : null}
          </>
        );
      }}
    </ReportPage>
  );
}

// ---------------------------------------------------------------- Performance

const PERFORMANCE_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'daily', label: 'Daily' },
];

export function PerformanceReportPage() {
  const filters = useReportFilters('ymd', ['periodType']);
  const periodType = filters.extras.periodType || 'monthly';
  const query = { periodType };
  const result = useReport<PerformanceReport>('/reports/performance', query);
  return (
    <ReportPage
      title="Performance report"
      subtitle={result.data?.period.label}
      result={result}
      actions={<ExportButtons dataset="performance" query={query} />}
      filters={
        <ChipFilter
          label="Period"
          value={periodType}
          options={PERFORMANCE_PERIODS}
          onChange={(v) => filters.setParam('periodType', v === 'monthly' ? '' : v)}
        />
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Staff', value: formatCount(r.totals.staff) },
              { label: 'Scored', value: formatCount(r.totals.scored) },
              { label: 'Average', value: formatBps(r.totals.averageScoreBps) },
              { label: 'Outstanding', value: formatCount(r.totals.outstanding), tone: 'success' },
              { label: 'Strong', value: formatCount(r.totals.strong), tone: 'info' },
              { label: 'Average band', value: formatCount(r.totals.average) },
              { label: 'Needs work', value: formatCount(r.totals.needsWork), tone: r.totals.needsWork ? 'warning' : undefined },
              { label: 'No data', value: formatCount(r.totals.noData) },
            ]}
          />
          <BreakdownTable
            title="Leaderboard"
            rows={r.top}
            rowKey={(x) => x.membershipId}
            empty="No scored staff for this period."
            columns={[
              {
                header: 'Staff',
                cell: (x) => (
                  <div className="reports-person">
                    <span className="reports-rank">{x.rank == null ? '—' : `#${x.rank}`}</span>
                    <div>
                      <Link to={`/performance/${x.membershipId}`}>{x.name}</Link>
                      <div className="muted small">{[x.designation, x.teamName].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                ),
              },
              { header: 'Score', cell: (x) => formatBps(x.scoreBps), num: true },
              { header: 'Band', cell: (x) => (x.scoreBand ? <Badge value={x.scoreBand} tone={bandTone(x.scoreBand)} /> : '—') },
              { header: 'Won', cell: (x) => formatCount(x.leadsWon), num: true },
              { header: 'Revenue', cell: (x) => formatMoney(x.revenueMinor), num: true },
              { header: 'Sales vs target', cell: (x) => formatBps(x.salesAchievementBps), num: true },
              { header: 'Follow-up done', cell: (x) => formatBps(x.followUpCompletionBps), num: true },
            ]}
          />
          {r.byTeam.length ? (
            <BreakdownTable
              title="Teams"
              rows={r.byTeam}
              rowKey={(x, i) => x.teamId ?? `none-${i}`}
              bar={(x) => x.averageScoreBps ?? 0}
              columns={[
                { header: 'Team', cell: (x) => x.teamName ?? 'No team' },
                { header: 'Staff', cell: (x) => formatCount(x.count), num: true },
                { header: 'Avg score', cell: (x) => formatBps(x.averageScoreBps), num: true },
              ]}
            />
          ) : null}
        </>
      )}
    </ReportPage>
  );
}

function bandTone(band: string): string {
  switch (band) {
    case 'outstanding':
      return 'success';
    case 'strong':
      return 'info';
    case 'needs_work':
      return 'danger';
    case 'average':
      return 'warning';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------- Incentives

const PAYOUT_STATUS_CHIPS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
];

export function IncentiveReportPage() {
  const { can } = useAuth();
  const filters = useReportFilters('ymd', ['status', 'planId', 'membershipId']);
  const result = useReport<IncentiveReport>('/reports/incentives', filters.query);
  const plans = useQuery({ queryKey: reportKeys.incentivePlans, queryFn: reportsApi.incentivePlans, staleTime: 5 * 60_000 });
  return (
    <ReportPage
      title="Incentive report"
      result={result}
      rangeFilters={filters}
      isEmpty={(r) => r.items.length === 0 && r.byMember.length === 0}
      emptyMessage="No incentives yet. Payouts appear here once plans are calculated for a period."
      actions={
        can(P.incentiveManage) ? (
          <Link className="btn btn-ghost btn-sm" to="/incentives/plans">
            Incentive plans
          </Link>
        ) : null
      }
      filters={
        <>
          <ChipFilter label="Payout status" value={filters.extras.status ?? ''} options={PAYOUT_STATUS_CHIPS} onChange={(v) => filters.setParam('status', v)} />
          <FilterBar filters={filters}>
            <DateRangeFilter filters={filters} />
            {plans.data?.length ? (
              <SelectFilter filters={filters} param="planId" label="All plans" options={plans.data.map((p) => ({ value: p.id, label: p.name }))} />
            ) : null}
            <StaffFilter filters={filters} param="membershipId" />
          </FilterBar>
        </>
      }
    >
      {(r) => {
        const t = r.totals;
        return (
          <>
            <MetricGrid
              items={[
                { label: 'Earned incentive', value: formatMoney(t.earnedAmount), tone: 'info' },
                { label: 'Target achievement', value: `${formatMoney(t.achievedValue)} / ${formatMoney(t.targetValue)}` },
                { label: 'Won orders', value: formatCount(t.wonOrders), tone: 'success' },
                { label: 'Completion', value: formatBps(t.completionBps) },
              ]}
            />
            <Section title="Payouts">
              <dl className="reports-facts">
                <div>
                  <dt>Payable</dt>
                  <dd>{formatMoney(t.payableAmount)}</dd>
                </div>
                <div>
                  <dt>On hold</dt>
                  <dd>{formatMoney(t.holdAmount)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{formatMoney(t.paidAmount)}</dd>
                </div>
                <div>
                  <dt>Average attainment</dt>
                  <dd>{formatBps(t.averageAttainmentBps)}</dd>
                </div>
              </dl>
              {r.byStatus.length ? (
                <div className="reports-badges reports-body">
                  {r.byStatus.map((s) => (
                    <Badge key={s.status} value={`${s.status} · ${s.count}`} tone={payoutTone(s.status)} />
                  ))}
                </div>
              ) : null}
            </Section>
            <BreakdownTable
              title="By member"
              rows={r.byMember}
              rowKey={(x, i) => x.membershipId ?? `none-${i}`}
              bar={(x) => x.earnedAmount}
              columns={[
                {
                  header: 'Name',
                  cell: (x) => (
                    <>
                      <div>{x.membershipName ?? 'Company'}</div>
                      <div className="muted small">{formatCount(x.wonOrders)} won orders</div>
                    </>
                  ),
                },
                { header: 'Attainment', cell: (x) => formatBps(ratioBps(x.achievedValue, x.targetValue)), num: true },
                { header: 'Earned', cell: (x) => formatMoney(x.earnedAmount), num: true },
                { header: 'Payable', cell: (x) => formatMoney(x.payableAmount), num: true },
                { header: 'Paid', cell: (x) => formatMoney(x.paidAmount), num: true },
              ]}
            />
            <BreakdownTable
              title="Payout lines"
              rows={r.items}
              rowKey={(x) => x.id}
              columns={[
                {
                  header: 'Member',
                  cell: (x) => (
                    <>
                      <div>{x.membershipName ?? 'Company'}</div>
                      <div className="muted small">{x.planName}</div>
                    </>
                  ),
                },
                { header: 'Period', cell: (x) => `${x.periodStart} → ${x.periodEnd}` },
                { header: 'Slab', cell: (x) => x.slabLabel ?? '—' },
                { header: 'Attainment', cell: (x) => formatBps(x.attainmentBps), num: true },
                { header: 'Earned', cell: (x) => formatMoney(x.earnedAmount), num: true },
                { header: 'Status', cell: (x) => <Badge value={x.status} tone={payoutTone(x.status)} /> },
              ]}
            />
          </>
        );
      }}
    </ReportPage>
  );
}

function payoutTone(status: string): string {
  switch (status) {
    case 'paid':
      return 'success';
    case 'approved':
      return 'info';
    case 'void':
      return 'danger';
    default:
      return 'warning';
  }
}

// ---------------------------------------------------------------- Pipeline analytics

export function PipelineAnalyticsPage() {
  const filters = useReportFilters('instant', ['pipelineId']);
  const lookups = useReportLookups();
  const query = filters.extras.pipelineId ? { pipelineId: filters.extras.pipelineId } : {};
  const result = useReport<PipelineAnalytics>('/reports/pipeline', query);
  const pipelines = lookups.data?.pipelines ?? [];
  return (
    <ReportPage
      title="Pipeline analytics"
      subtitle={result.data?.pipeline.name}
      result={result}
      actions={
        <Link className="btn btn-ghost btn-sm" to="/pipeline">
          Pipeline board
        </Link>
      }
      filters={
        pipelines.length > 1 ? (
          <FilterBar filters={filters}>
            <SelectFilter filters={filters} param="pipelineId" label="Default pipeline" options={pipelines.map((p) => ({ value: p.id, label: p.name }))} />
          </FilterBar>
        ) : null
      }
    >
      {(r) => {
        const max = Math.max(1, maxOf(r.stages, (s) => s.reachedCount));
        return (
          <>
            <MetricGrid
              items={[
                { label: 'Leads', value: formatCount(r.totals.leads) },
                { label: 'Open', value: formatCount(r.totals.open), tone: 'info' },
                { label: 'Won', value: formatCount(r.totals.won), tone: 'success' },
                { label: 'Lost', value: formatCount(r.totals.lost), tone: 'danger' },
                { label: 'Win rate', value: formatBps(r.totals.winRateBps) },
                { label: 'Conversion', value: formatBps(r.totals.conversionBps) },
                { label: 'Pipeline value', value: formatMoney(r.totals.pipelineValueMinor) },
                { label: 'Won value', value: formatMoney(r.totals.wonValueMinor) },
              ]}
            />
            <Section title="Funnel">
              <div className="reports-stages">
                {[...r.stages]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((s) => (
                    <div key={s.id} className="reports-stage">
                      <div className="reports-stage-head">
                        <span>
                          {s.name} {s.isWon ? <Badge value="won" /> : s.isLost ? <Badge value="lost" /> : null}
                        </span>
                        <span className="reports-stage-meta">{formatMoney(s.currentValueMinor)}</span>
                      </div>
                      <div className="reports-stage-meta">
                        Now {formatCount(s.currentCount)} · Reached {formatCount(s.reachedCount)} · From previous {formatBps(s.conversionFromPreviousBps)}
                        {s.dropOffCount == null ? '' : ` · Drop-off ${formatCount(s.dropOffCount)}`}
                      </div>
                      <Bar percent={barPercent(s.reachedCount, max)} />
                    </div>
                  ))}
              </div>
            </Section>
          </>
        );
      }}
    </ReportPage>
  );
}

// ---------------------------------------------------------------- Funnel

const STAGE_COLORS: Record<string, string> = {
  lead: '#2563EB',
  qualified: '#0F766E',
  quotation: '#B45309',
  negotiation: '#C2410C',
  won: '#15803D',
};

export const stageColor = (code: string | undefined) => STAGE_COLORS[code ?? ''] ?? STAGE_COLORS.lead;

export function FunnelReportPage({ personal = false }: { personal?: boolean }) {
  const result = useReport<FunnelReport>(personal ? '/reports/funnel/me' : '/reports/funnel', {});
  const r = result.data;
  return (
    <ReportPage
      title={personal ? 'My funnel' : 'Funnel report'}
      subtitle={r ? `${r.month.label} · Today ${r.today} · ${r.timezone}` : undefined}
      result={result}
      actions={personal ? null : <ExportButtons dataset="funnel" query={{}} />}
    >
      {(report) => {
        const maxReached = Math.max(1, maxOf(report.stages, (s) => s.reachedCount));
        const maxConversion = Math.max(1, maxOf(report.charts.conversion, (c) => c.value));
        const maxCurrent = Math.max(1, maxOf(report.charts.current, (c) => c.value));
        return (
          <>
            <MetricGrid
              items={[
                ...report.stages.map((s) => ({ label: s.label, value: formatCount(s.reachedCount) })),
                { label: 'Conversion', value: formatBps(report.conversion.overallBps), tone: 'success' as const },
              ]}
            />
            <div className="grid-2">
              <Section title="Funnel">
                <div className="reports-funnel">
                  {report.stages.map((s) => (
                    <div key={s.code} className="reports-funnel-row">
                      <div
                        className="reports-funnel-step"
                        style={{ background: stageColor(s.code), width: `${Math.max(30, barPercent(s.reachedCount, maxReached))}%` }}
                      >
                        {s.label} · {formatCount(s.reachedCount)}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              <div className="stack">
                <Section title="Conversion">
                  <div className="reports-stages">
                    {report.charts.conversion.length === 0 ? <p className="muted">No conversions yet.</p> : null}
                    {report.charts.conversion.map((c) => (
                      <div key={c.code ?? c.label} className="reports-stage">
                        <div className="reports-stage-head">
                          <span>{c.label}</span>
                          <span>{formatBps(c.value)}</span>
                        </div>
                        <Bar percent={barPercent(c.value, maxConversion)} />
                      </div>
                    ))}
                  </div>
                </Section>
                <Section title="Currently in stage">
                  <div className="reports-stages">
                    {report.charts.current.length === 0 ? <p className="muted">Nothing in the funnel right now.</p> : null}
                    {report.charts.current.map((c) => (
                      <div key={c.code ?? c.label} className="reports-stage">
                        <div className="reports-stage-head">
                          <span>{c.label}</span>
                          <span>{formatCount(c.value)}</span>
                        </div>
                        <Bar percent={barPercent(c.value, maxCurrent)} color={stageColor(c.code)} />
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
            <BreakdownTable
              title="Last 7 days"
              rows={report.charts.trend}
              rowKey={(p) => p.date}
              columns={[
                { header: 'Day', cell: (p) => p.label },
                ...report.stages.map((s) => ({
                  header: s.label,
                  num: true,
                  cell: (p: (typeof report.charts.trend)[number]) => formatCount(Number(p[s.code]) || 0),
                })),
              ]}
            />
            <Section title="Stage detail">
              <div className="reports-stages">
                {report.stages.map((s) => {
                  const seriesMax = Math.max(1, maxOf(s.series, (p) => p.value));
                  return (
                    <div key={s.code} className="reports-stage">
                      <div className="reports-stage-head">
                        <span style={{ color: stageColor(s.code) }}>{s.label}</span>
                        <span className="reports-stage-meta">From previous {formatBps(s.conversionFromPreviousBps)}</span>
                      </div>
                      <div className="reports-stage-meta">
                        Reached {formatCount(s.reachedCount)} · Now {formatCount(s.currentCount)}
                        {s.dropOffCount == null ? '' : ` · Drop-off ${formatCount(s.dropOffCount)}`} · Value {formatMoney(s.reachedValueMinor)} reached ·{' '}
                        {formatMoney(s.currentValueMinor)} current
                      </div>
                      {s.series.length ? (
                        <div className="reports-spark" role="img" aria-label={`${s.label} by day`}>
                          {s.series.map((p, i) => (
                            <span
                              key={p.date ?? i}
                              title={`${p.label}: ${p.value}`}
                              style={{ height: `${Math.max(2, barPercent(p.value, seriesMax))}%`, background: stageColor(s.code) }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        );
      }}
    </ReportPage>
  );
}
