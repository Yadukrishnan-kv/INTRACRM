import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { useToast } from '../../components/toast';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { perfApi, perfKeys } from './api';
import { Avatar, Gauge, Progress } from './components';
import { boardCard, boardDelta, boardIsMoney, boardShareText, boardValue, dayLabel, fraction, pct, podiumOrder } from './logic';
import type { SalesBoard, SalesBoardCard } from './types';
import './performance.css';

/**
 * `/targets/sales-board` — Monthly Sales Target: gauge and pace for the viewer
 * or the company, forecast and suggestions, podium, ranking and the daily trail.
 */
export function SalesBoardPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? 'this_month';
  const scope = params.get('scope') ?? 'tenant';
  const mine = params.get('mine') === '1';
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  // "My target" only picks which card renders — both arrive in one response.
  const query = useQuery({
    queryKey: perfKeys.salesBoard({ period, scope }),
    queryFn: () => perfApi.salesBoard({ period, scope }),
  });

  const share = async (board: SalesBoard, card: SalesBoardCard) => {
    try {
      await navigator.clipboard.writeText(boardShareText(board, card));
      toast.success('Summary copied to clipboard.');
    } catch {
      toast.error('Could not copy the summary.');
    }
  };

  const board = query.data;
  const card = board ? boardCard(board, mine) : null;

  return (
    <>
      <Link to="/targets" className="back-link">
        ← Targets
      </Link>
      <PageHeader
        title="Monthly Sales Target"
        subtitle={board?.period.label}
        actions={
          board && card ? (
            <button type="button" className="btn btn-ghost" onClick={() => void share(board, card)}>
              Share
            </button>
          ) : null
        }
      />

      <div className="toolbar perf-toolbar">
        <label className="btn-row small">
          Show
          <select className="input" value={period} onChange={(e) => setParam('period', e.target.value === 'this_month' ? '' : e.target.value)}>
            {(board?.periods.length ? board.periods : [{ code: period, title: board?.period.title ?? 'This month' }]).map((o) => (
              <option key={o.code} value={o.code}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        {board && board.scopes.length > 1 ? (
          <label className="btn-row small">
            Scope
            <select className="input" value={scope} onChange={(e) => setParam('scope', e.target.value === 'tenant' ? '' : e.target.value)}>
              {board.scopes.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="checkbox" title={board && !board.me ? 'No personal target on this board' : undefined}>
          <input
            type="checkbox"
            checked={mine && !!board?.me}
            disabled={!board?.me}
            onChange={(e) => setParam('mine', e.target.checked ? '1' : '')}
          />
          <span>My target</span>
        </label>
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !board || !card || (board.overall.targetValue <= 0 && board.standings.length === 0) ? (
        <EmptyState>No targets yet. Set a revenue target to see progress, pace and the leaderboard here.</EmptyState>
      ) : (
        <Board board={board} card={card} />
      )}
    </>
  );
}

function Board({ board, card }: { board: SalesBoard; card: SalesBoardCard }) {
  const { can } = useAuth();
  const money = boardIsMoney(board);
  const fmt = (v: number) => boardValue(v, money);
  const onTrack = card.pace.status === 'on_track';
  const personLink = (id: string | null) => (id && can(P.performanceRead) ? `/performance/${id}` : null);

  return (
    <div className="stack">
      <div className="grid-2">
        <section className="card">
          <div className="list-row">
            <div>
              <strong>{card.name}</strong>
              <div className="muted small">{board.period.label}</div>
            </div>
            {card.rank !== null ? (
              <span className="badge badge-info">
                🏆 #{card.rank} of {card.rankOf}
              </span>
            ) : null}
          </div>
          <Gauge
            value={fraction(card.achievementBps)}
            valueLabel={fmt(card.achievedValue)}
            caption={`${board.metric.name} · ${pct(card.achievementBps)}`}
            maxLabel={fmt(card.targetValue)}
            onTrack={onTrack}
          />
          <div className="perf-figures">
            <dl>
              <dt>Total target</dt>
              <dd>{fmt(card.targetValue)}</dd>
              <dt>Target achieved</dt>
              <dd>{fmt(card.achievedValue)}</dd>
              <dt>Left to achieve</dt>
              <dd>{fmt(card.remaining)}</dd>
              <dt>Daily average</dt>
              <dd>{fmt(card.dailyAverage)}</dd>
              {card.dailyRequired !== null ? (
                <>
                  <dt>Daily required</dt>
                  <dd>{fmt(card.dailyRequired)}</dd>
                </>
              ) : null}
              <dt>Time left</dt>
              <dd>
                {card.daysRemaining} {card.daysRemaining === 1 ? 'day' : 'days'}
              </dd>
            </dl>
          </div>
          <div className={`perf-pace ${onTrack ? 'perf-pace-ok' : 'perf-pace-behind'}`}>
            <strong className={onTrack ? 'perf-text-success' : 'perf-text-danger'}>
              {onTrack ? '✔' : '!'} {card.pace.title}
            </strong>
            <div className="small">{card.pace.detail}</div>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <h2 className="perf-section-title">Forecast</h2>
            <div className="btn-row perf-baseline">
              <strong className="perf-stat-value">{card.forecastValue === null ? '—' : fmt(card.forecastValue)}</strong>
              {card.forecastDelta !== null ? (
                <span className={card.forecastDelta >= 0 ? 'perf-text-success' : 'perf-text-danger'}>{boardDelta(card.forecastDelta, money)}</span>
              ) : null}
            </div>
            <p className="muted small">From target of {fmt(card.targetValue)}</p>
            <Progress value={fraction(card.achievementBps)} />
          </section>
          <section className="card">
            <h2 className="perf-section-title">Suggestions</h2>
            {board.suggestions.length === 0 ? (
              <p className="muted small">No suggestions right now.</p>
            ) : (
              <ul className="list">
                {board.suggestions.map((s) => (
                  <li key={s.code}>
                    <strong className="small">{s.title}</strong>
                    <span className="small">{s.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {board.podium.length > 0 ? (
        <section className="card">
          <h2 className="perf-section-title">Leaderboard</h2>
          <div className="perf-podium">
            {podiumOrder(board.podium).map((e) => {
              const to = personLink(e.membershipId);
              const inner = (
                <>
                  <Avatar name={e.name} />
                  <strong className="small">{e.name}</strong>
                  <span className="small muted">
                    {fmt(e.achievedValue)} · {pct(e.achievementBps)}
                  </span>
                  <div className="perf-podium-step">{e.rank}</div>
                </>
              );
              return to ? (
                <Link key={e.membershipId} to={to} className={`perf-podium-${e.rank}`}>
                  {inner}
                </Link>
              ) : (
                <a key={e.membershipId} className={`perf-podium-${e.rank}`}>
                  {inner}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {board.standings.length > 0 ? (
        <section className="card table-wrap">
          <h2 className="perf-section-title perf-table-title">Ranking</h2>
          <table className="table">
            <thead>
              <tr>
                <th>User name</th>
                <th className="num">Target</th>
                <th className="num">Sale</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {board.standings.map((row) => {
                const to = personLink(row.membershipId);
                return (
                  <tr key={row.membershipId} className={board.me?.membershipId === row.membershipId ? 'perf-row-me' : undefined}>
                    <td>
                      <div className="perf-person">
                        <span className="perf-rank">#{row.rank}</span>
                        <div>
                          {to ? <Link to={to}>{row.name}</Link> : row.name}
                          {row.designation ? <div className="muted small">{row.designation}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="num">{fmt(row.targetValue)}</td>
                    <td className={`num ${row.onTrack ? 'perf-text-success' : 'perf-text-danger'}`}>
                      <strong>{fmt(row.achievedValue)}</strong>
                    </td>
                    <td className="num">{pct(row.achievementBps)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {board.insights.length > 0 ? (
        <details className="card perf-insights">
          <summary>Insights</summary>
          <div className="table-wrap perf-insights-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Sale</th>
                  <th className="num">Cumulative</th>
                  <th className="num">Average</th>
                </tr>
              </thead>
              <tbody>
                {[...board.insights].reverse().map((row) => (
                  <tr key={row.date}>
                    <td>{dayLabel(row.date)}</td>
                    <td className="num">{fmt(row.value)}</td>
                    <td className="num">{fmt(row.cumulative)}</td>
                    <td className="num muted">{fmt(row.runningAverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
