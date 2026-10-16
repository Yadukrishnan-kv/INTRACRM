import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { perfApi, perfKeys } from './api';
import { BarChart, Donut, MixChart, StatTile } from './components';
import {
  dashboardValue,
  isMoneyWidget,
  isScoreWidget,
  metricDisplay,
  metricValue,
  widgetPrimary,
  widgetRelated,
  widgetTitle,
  workingDaysBetween,
} from './logic';
import './performance.css';

/** Drill-down for one founder-dashboard widget (`/dashboard/:widgetCode`). */
export function DashboardDetailPage() {
  const { widgetCode = '' } = useParams();
  const query = useQuery({
    queryKey: perfKeys.dashboardWidget(widgetCode),
    queryFn: () => perfApi.dashboardWidget(widgetCode),
  });
  const isSales = widgetCode === 'sales';
  const related = widgetRelated(widgetCode);

  return (
    <>
      <Link to="/dashboard" className="back-link">
        ← Dashboard
      </Link>
      <PageHeader title={widgetTitle(widgetCode)} subtitle={query.data?.month.label} />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.widget ? (
        <EmptyState>This dashboard widget has no data for the current period.</EmptyState>
      ) : (
        (() => {
          const { widget: data, month, today } = query.data;
          const kind = { money: isMoneyWidget(data), score: isScoreWidget(data) };
          const target = metricValue(data, 'target');
          const achieved = data.month;
          const progress = target <= 0 ? 0 : Math.min(achieved / target, 1);
          const workingDays = metricValue(data, 'working_days', workingDaysBetween(month.start, month.end) ?? 26);
          const remaining = metricValue(data, 'days_remaining', workingDaysBetween(today, month.end) ?? 0);
          const requiredDaily = remaining <= 0 ? 0 : Math.round(Math.min(Math.max(target - achieved, 0), target) / remaining);
          const fmt = (v: number) => dashboardValue(v, kind);
          return (
            <div className="stack">
              <section className="card perf-figures">
                <dl>
                  <dt>Target</dt>
                  <dd>{fmt(target)}</dd>
                  <dt>Achievement</dt>
                  <dd>{fmt(achieved)}</dd>
                </dl>
                <Donut value={progress} caption="Achievement" />
              </section>

              {isSales ? (
                <div className="perf-stats">
                  <StatTile label="Working days" value={workingDays} />
                  <StatTile label="Days remaining" value={remaining} />
                  <StatTile label="Required daily sales" value={formatMoney(requiredDaily)} />
                </div>
              ) : (
                <div className="perf-stats">
                  <StatTile label={data.primaryLabel || 'Today'} value={widgetPrimary(data)} />
                  {data.metrics.map((m) => (
                    <StatTile key={m.code} label={m.label} value={metricDisplay(data, m)} />
                  ))}
                </div>
              )}

              {data.series.length > 0 ? (
                <section className="card">
                  <h2 className="perf-section-title">Last 7 days</h2>
                  <BarChart points={data.series} format={fmt} />
                </section>
              ) : null}

              {data.mix.length > 0 ? (
                <section className="card">
                  <h2 className="perf-section-title">{isSales ? 'Category-wise Performance' : 'Breakdown'}</h2>
                  <MixChart slices={data.mix} format={fmt} share />
                </section>
              ) : null}

              <div>
                <Link className="btn btn-primary" to={related.to}>
                  {related.label}
                </Link>
              </div>
            </div>
          );
        })()
      )}
    </>
  );
}
