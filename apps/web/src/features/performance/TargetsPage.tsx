import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useCursorList } from '../../lib/hooks';
import { perfApi, perfKeys } from './api';
import { Progress, StatTile } from './components';
import {
  forecastTitle,
  forecastTone,
  fraction,
  pct,
  signedBalance,
  targetBps,
  targetFilterQuery,
  targetRate,
  targetTitle,
  targetValue,
} from './logic';
import './performance.css';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'daily', label: 'Daily' },
  { id: 'team', label: 'Team' },
  { id: 'product', label: 'Product' },
];

export function TargetsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? '';
  const setFilter = (id: string) => setParams(id ? { filter: id } : {}, { replace: true });

  const progress = useQuery({ queryKey: perfKeys.targetProgress, queryFn: perfApi.targetProgress });
  const q = targetFilterQuery(filter);
  const list = useCursorList(perfKeys.targetList(q), (cursor) => perfApi.targets({ ...q, cursor }));
  const p = progress.data;
  const counts: Record<string, number | undefined> = {
    monthly: p?.month.items.length,
    daily: p?.today.items.length,
    team: p?.teams.length,
    product: p?.products.length,
  };

  return (
    <>
      <PageHeader
        title="Targets"
        subtitle="Monthly, daily, team and product targets with live progress."
        actions={
          <>
            <Link className="btn btn-ghost" to="/targets/sales-board">
              Sales board
            </Link>
            {can(P.targetManage) ? (
              <Link className="btn btn-primary" to="/targets/create">
                New target
              </Link>
            ) : null}
          </>
        }
      />

      {p ? (
        <div className="perf-stats perf-stats-spaced">
          <StatTile icon="✓" tone="success" label="On track" value={p.totals.onTrack} />
          <StatTile icon="!" tone="warning" label="Behind" value={p.totals.behind} />
          <StatTile icon="%" tone="info" label="Average attainment" value={pct(p.totals.averageAttainmentBps)} />
        </div>
      ) : null}

      <div className="btn-row chip-scroll perf-chip-row" role="group" aria-label="Target filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? ' chip-active' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id && counts[f.id] !== undefined ? <span className="muted"> {counts[f.id]}</span> : null}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>No targets. Set a monthly, daily, team, or product target to track live progress.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Period</th>
                <th>Progress</th>
                <th className="num">Balance</th>
                <th className="num">Need / day</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((t) => {
                const bal = signedBalance(t);
                return (
                  <tr key={t.id} className="row-link" onClick={() => navigate(`/targets/${t.id}`)}>
                    <td>
                      <Link to={`/targets/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        {targetTitle(t)}
                      </Link>
                    </td>
                    <td>{t.periodLabel}</td>
                    <td className="perf-progress-cell">
                      <div className="list-row small">
                        <span>
                          {targetValue(t, t.achievedValue)} / {targetValue(t, t.targetValue)}
                        </span>
                        <strong>{pct(targetBps(t))}</strong>
                      </div>
                      <Progress value={fraction(targetBps(t))} tone={t.onTrack ? undefined : 'warning'} />
                    </td>
                    <td className="num">{bal < 0 ? `+${targetValue(t, -bal)}` : targetValue(t, bal)}</td>
                    <td className="num">{t.dailyRequired === null ? '—' : targetRate(t, t.dailyRequired)}</td>
                    <td>
                      <Badge value={forecastTitle(t.forecastBand)} tone={forecastTone(t.forecastBand)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.hasNextPage ? (
            <div className="table-footer">
              <button type="button" className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
