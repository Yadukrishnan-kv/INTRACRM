import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { KpiItem } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../lib/format';
import { perfApi, perfKeys } from './api';
import { Avatar, Donut, Progress } from './components';
import { DASHBOARD_WIDGETS, KPI_ROUTES, kpiValueLabel, metricValue, pct, prettyDate, widgetPrimary } from './logic';
import { StaffDashboardPage } from './StaffDashboardPage';
import './performance.css';

/**
 * Home. The founder dashboard needs `dashboard:read`; staff who only hold
 * `dashboard:self` get their personal dashboard instead (as on mobile), and no
 * forbidden request goes out.
 */
export function DashboardPage() {
  const { can } = useAuth();
  if (!can(P.dashboardRead)) return <StaffDashboardPage />;
  return <FounderDashboard />;
}

/** Icon and accent per KPI code; unknown codes fall back to the teal default. */
const KPI_LOOK: Record<string, { icon: string; tone: string }> = {
  todays_follow_ups: { icon: '📅', tone: 'info' },
  mtd_billing: { icon: '₹', tone: 'success' },
  target_achieved: { icon: '🎯', tone: 'warning' },
  active_leads: { icon: '👥', tone: 'teal' },
  pending_quotations: { icon: '📄', tone: 'info' },
  won_this_month: { icon: '🏆', tone: 'success' },
};

function KpiTile({ item }: { item: KpiItem }) {
  const route = KPI_ROUTES[item.code];
  const look = KPI_LOOK[item.code] ?? { icon: '•', tone: 'teal' };
  const delta = item.deltaBps === null ? null : Math.round(item.deltaBps / 100);
  const trend = delta === null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const body = (
    <>
      <span className="perf-kpi-head">
        <span className={`perf-kpi-icon perf-kpi-icon-${look.tone}`} aria-hidden>
          {look.icon}
        </span>
        <span className="perf-kpi-title">{item.title}</span>
      </span>
      <span className="perf-kpi-foot">
        <strong className="perf-kpi-value">{kpiValueLabel(item)}</strong>
        {delta !== null ? (
          <span className={`perf-delta perf-delta-${trend}`}>
            {trend === 'up' ? '▲ +' : trend === 'down' ? '▼ ' : ''}
            {delta}%
          </span>
        ) : null}
      </span>
    </>
  );
  return route ? (
    <Link to={route} className="card perf-kpi perf-link-card" title={item.detail}>
      {body}
    </Link>
  ) : (
    <div className="card perf-kpi" title={item.detail}>
      {body}
    </div>
  );
}

function FounderDashboard() {
  const { can } = useAuth();
  const board = useQuery({ queryKey: perfKeys.dashboard, queryFn: perfApi.dashboard, refetchInterval: 60_000 });
  // Loaded separately so the KPI row paints as soon as its own queries return.
  const kpis = useQuery({ queryKey: perfKeys.kpis, queryFn: perfApi.kpis, refetchInterval: 60_000 });

  if (board.isLoading) return <Spinner />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />;
  const data = board.data!;
  const w = data.widgets;
  const followUps = w.follow_ups;
  const quotations = w.quotations;
  const sales = w.sales;
  const staff = w.staff_performance;
  const target = metricValue(sales, 'target');
  const achieved = sales?.month ?? 0;
  const progress = target <= 0 ? 0 : Math.min(achieved / target, 1);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${prettyDate(data.today)} · updated ${formatDateTime(data.generatedAt)}`}
        actions={
          <>
            {can(P.dashboardSelf) ? (
              <Link className="btn btn-ghost" to="/dashboard/me">
                My dashboard
              </Link>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={() => void Promise.all([board.refetch(), kpis.refetch()])}>
              Refresh
            </button>
          </>
        }
      />

      {Object.keys(w).length === 0 ? (
        <EmptyState>No dashboard data. Leads, follow-ups, and quotations will appear here as work is logged.</EmptyState>
      ) : (
        <div className="stack">
          {kpis.data && kpis.data.items.length > 0 ? (
            <section className="perf-kpis" aria-label="Key figures">
              {kpis.data.items.map((item) => (
                <KpiTile key={item.code} item={item} />
              ))}
            </section>
          ) : null}

          <section className="perf-glance">
            <h2>Today at a Glance</h2>
            <div className="perf-glance-grid">
              <div>
                <strong>{w.leads?.primary ?? 0}</strong>
                <span>New Leads</span>
              </div>
              <div>
                <strong>{followUps?.primary ?? 0}</strong>
                <span>Follow-ups Today</span>
              </div>
              <div>
                <strong>{quotations ? metricValue(quotations, 'open', quotations.month) : 0}</strong>
                <span>Quotation Follow-up</span>
              </div>
              <div>
                <strong>{w.orders?.primary ?? 0}</strong>
                <span>Orders Won</span>
              </div>
              <div>
                <strong>{formatMoney(sales?.primary ?? 0)}</strong>
                <span>Today's Sales</span>
              </div>
              <div>
                <strong>{formatMoney(target)}</strong>
                <span>Today's Target</span>
              </div>
            </div>
          </section>

          <div className="grid-2">
            <section className="card">
              <h2 className="perf-section-title">Follow-up Alerts</h2>
              <Link to="/tasks?view=overdue" className="perf-alert">
                <span>
                  <i className="perf-alert-icon perf-kpi-icon-danger" aria-hidden>⚠</i>Overdue Follow-ups
                </span>
                <strong className="perf-text-danger">{metricValue(followUps, 'overdue')}</strong>
              </Link>
              <Link to="/tasks?bucket=today" className="perf-alert">
                <span>
                  <i className="perf-alert-icon perf-kpi-icon-warning" aria-hidden>⏱</i>Follow-ups Due Today
                </span>
                <strong className="perf-text-warning">{followUps?.primary ?? 0}</strong>
              </Link>
              <Link to="/quotations" className="perf-alert">
                <span>
                  <i className="perf-alert-icon perf-kpi-icon-info" aria-hidden>📄</i>Quotation Follow-ups
                </span>
                <strong className="perf-text-info">{metricValue(quotations, 'open')}</strong>
              </Link>
            </section>

            <section className="card">
              <h2 className="perf-section-title">MTD Performance</h2>
              <div className="perf-figures">
                <dl>
                  <dt>Month</dt>
                  <dd>{data.month.label}</dd>
                  <dt>Target</dt>
                  <dd>{formatMoney(target)}</dd>
                  <dt>Achievement</dt>
                  <dd>{formatMoney(achieved)}</dd>
                </dl>
                <Donut value={progress} caption="Achievement" />
              </div>
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <Link to="/dashboard/sales">View details</Link>
              </div>
            </section>
          </div>

          <section className="card">
            <h2 className="perf-section-title">Staff Performance (MTD)</h2>
            {!staff || staff.series.length === 0 ? (
              <p className="muted">Staff scores appear once activity is logged.</p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {staff.series.slice(0, 5).map((point) => (
                  <div key={point.date || point.label} className="perf-person">
                    <Avatar name={point.label} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-row">
                        <strong>{point.label}</strong>
                        <strong className="perf-text-info">{pct(point.value)}</strong>
                      </div>
                      <Progress value={Math.min(Math.max(point.value, 0), 10000) / 10000} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {can(P.performanceRead) ? (
              <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <Link to="/performance">View all</Link>
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="section-title">Widgets</h2>
            <div className="perf-kpis">
              {DASHBOARD_WIDGETS.map((code) => w[code])
                .filter((widget) => !!widget)
                .map((widget) => (
                  <Link key={widget!.code} to={`/dashboard/${widget!.code}`} className="card perf-kpi perf-link-card">
                    <span className="perf-kpi-title">{widget!.title}</span>
                    <span className="perf-kpi-foot">
                      <strong className="perf-kpi-value">{widgetPrimary(widget!)}</strong>
                      <span className="muted small">{widget!.primaryLabel}</span>
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
