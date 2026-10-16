import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { perfApi, perfKeys } from './api';
import { BarChart, DeltaPill, ExportAnalyticsButton, FunnelChart, MixChart, StatTile, WidgetCard } from './components';
import {
  ANALYTICS_METRICS,
  analyticsRelated,
  analyticsTitle,
  dashboardValue,
  isMoneyWidget,
  isScoreWidget,
  metricDisplay,
  orderedWidgets,
  pct,
  widgetMonth,
  widgetPrimary,
} from './logic';
import type { AnalyticsDashboard, Funnel } from './types';
import './performance.css';

const monthFunnel = (board: Pick<AnalyticsDashboard, 'funnel'>): Funnel => board.funnel.month ?? board.funnel;

/**
 * `/analytics` (company, `dashboard:read`) and `/analytics/me` (personal,
 * `dashboard:self`). Users with only `dashboard:self` opening `/analytics`
 * get their own numbers rather than a forbidden error.
 */
export function AnalyticsPage({ mine = false }: { mine?: boolean }) {
  const { can } = useAuth();
  const personal = mine || !can(P.dashboardRead);
  const query = useQuery({
    queryKey: perfKeys.analytics(personal),
    queryFn: personal ? perfApi.analyticsMine : perfApi.analytics,
  });

  return (
    <>
      <PageHeader
        title={personal ? 'My analytics' : 'Analytics'}
        subtitle={query.data ? `${query.data.month.label} · today ${query.data.today} · ${query.data.timezone}` : undefined}
        actions={
          <>
            {personal && can(P.dashboardRead) ? (
              <Link className="btn btn-ghost" to="/analytics">
                Company analytics
              </Link>
            ) : null}
            {!personal && can(P.dashboardSelf) ? (
              <Link className="btn btn-ghost" to="/analytics/me">
                My analytics
              </Link>
            ) : null}
            {!personal ? <ExportAnalyticsButton /> : null}
          </>
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        (() => {
          const board = query.data!;
          const widgets = orderedWidgets(board.widgets, ANALYTICS_METRICS);
          if (widgets.length === 0) {
            return (
              <EmptyState>
                {personal
                  ? 'No personal analytics. Your leads, qualifications, quotations, and wins will appear here.'
                  : 'No analytics yet. Leads, qualifications, quotations, and wins will appear here as work is logged.'}
              </EmptyState>
            );
          }
          const funnel = monthFunnel(board);
          const c = funnel.conversion;
          return (
            <div className="stack">
              <section className="card">
                <div className="list-row">
                  <h2 className="perf-section-title">Funnel</h2>
                  {can(P.dashboardRead) || can(P.dashboardSelf) ? (
                    <Link to={personal ? '/reports/funnel/me' : '/reports/funnel'} className="small">
                      Funnel report
                    </Link>
                  ) : null}
                </div>
                <FunnelChart funnel={funnel} />
                <div className="perf-widget-metrics perf-funnel-rates">
                  <span className="badge badge-neutral">Lead → Qualified {pct(c.leadToQualifiedBps)}</span>
                  {!personal ? <span className="badge badge-neutral">Qualified → Quotation {pct(c.qualifiedToQuotationBps)}</span> : null}
                  <span className="badge badge-neutral">Quotation → Won {pct(c.quotationToWonBps)}</span>
                  <span className="badge badge-info">Conversion {pct(c.overallBps)}</span>
                </div>
              </section>
              <section>
                <h2 className="section-title">Metrics</h2>
                <div className="perf-widgets">
                  {widgets.map((w) => (
                    <WidgetCard key={w.code} widget={w} to={`/analytics/${w.code}${personal ? '?mine=1' : ''}`} />
                  ))}
                </div>
              </section>
            </div>
          );
        })()
      )}
    </>
  );
}

/** `/analytics/:metricCode` — one metric's today/month figures, 7-day bars and breakdown. */
export function AnalyticsDetailPage() {
  const { metricCode = '' } = useParams();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const personal = !can(P.dashboardRead) || params.get('mine') === '1';
  // Staff without `dashboard:read` cannot call /analytics/:code, so their
  // detail comes out of their own board.
  const query = useQuery({
    queryKey: [...perfKeys.analyticsMetric(metricCode), personal ? 'me' : 'all'],
    queryFn: async () => {
      if (personal) {
        const board = await perfApi.analyticsMine();
        return { month: board.month, widget: board.widgets[metricCode] ?? null };
      }
      const d = await perfApi.analyticsMetric(metricCode);
      return { month: d.month, widget: d.widget ?? null };
    },
  });
  const detail = query.data;
  const related = analyticsRelated(metricCode);

  return (
    <>
      <Link to={personal ? '/analytics/me' : '/analytics'} className="back-link">
        ← Analytics
      </Link>
      <PageHeader
        title={analyticsTitle(metricCode)}
        subtitle={detail?.month.label}
        actions={
          detail?.widget ? (
            <Link className="btn btn-primary" to={related.to}>
              {related.label}
            </Link>
          ) : null
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !detail?.widget ? (
        <EmptyState>This analytics metric has no data for the current period.</EmptyState>
      ) : (
        (() => {
          const data = detail.widget;
          const fmt = (v: number) => dashboardValue(v, { money: isMoneyWidget(data), score: isScoreWidget(data) });
          return (
            <div className="stack">
              <section className="card perf-widget">
                <span className="perf-kpi-title">{data.primaryLabel || 'Today'}</span>
                <div className="perf-kpi-foot">
                  <div className="perf-widget-value">{widgetPrimary(data)}</div>
                  {data.deltaBps === null || data.deltaBps === undefined ? null : (
                    <span className="muted small">
                      vs yesterday <DeltaPill bps={data.deltaBps} />
                    </span>
                  )}
                </div>
              </section>
              <div className="perf-stats">
                <StatTile label={data.code === 'conversion' ? 'This month' : 'Month / total'} value={widgetMonth(data)} />
                {data.metrics.map((m) => (
                  <StatTile key={m.code} label={m.label} value={metricDisplay(data, m)} />
                ))}
              </div>
              <section className="card">
                <h2 className="perf-section-title">Last 7 days</h2>
                <BarChart points={data.series} format={fmt} />
              </section>
              {data.mix.length > 0 ? (
                <section className="card">
                  <h2 className="perf-section-title">Breakdown</h2>
                  <MixChart slices={data.mix} format={fmt} />
                </section>
              ) : null}
            </div>
          );
        })()
      )}
    </>
  );
}
