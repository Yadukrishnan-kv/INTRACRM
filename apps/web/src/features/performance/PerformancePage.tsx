import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { perfApi, perfKeys, type PerformanceQuery } from './api';
import { Avatar, StatTile } from './components';
import { bandTitle, bandTone, LEADERBOARDS, pct, performanceTotals, shiftPeriodStart, type LeaderboardCode } from './logic';
import './performance.css';

/** `/performance` — "Target & Achievement": staff standings by period and team. */
export function PerformancePage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const periodType = params.get('period') === 'daily' ? 'daily' : 'monthly';
  const periodStart = params.get('start') ?? '';
  const teamId = params.get('team') ?? '';
  const boardCode = (LEADERBOARDS.find((b) => b.code === params.get('board'))?.code ?? 'overall') as LeaderboardCode;
  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const catalog = useQuery({ queryKey: perfKeys.performanceCatalog, queryFn: perfApi.performanceCatalog, staleTime: 5 * 60_000 });
  const q: PerformanceQuery = { periodType, periodStart: periodStart || undefined, teamId: teamId || undefined };
  const board = useQuery({ queryKey: perfKeys.leaderboard(q), queryFn: () => perfApi.leaderboard(q) });
  const rows = board.data ? (boardCode === 'overall' ? board.data.standings : board.data.leaderboards[boardCode]) : [];
  const totals = performanceTotals(rows);
  const teams = catalog.data?.teams ?? [];
  const currentStart = board.data?.period.start ?? periodStart;

  return (
    <>
      <PageHeader
        title="Target & Achievement"
        subtitle="Staff standings, sales achievement and score by period."
        actions={
          me?.membershipId ? (
            <Link className="btn btn-ghost" to={`/performance/${me.membershipId}`}>
              My score
            </Link>
          ) : null
        }
      />

      <div className="toolbar perf-toolbar">
        <div className="perf-segment" role="group" aria-label="Period type">
          {(['monthly', 'daily'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={periodType === p} onClick={() => update({ period: p === 'monthly' ? '' : p, start: '' })}>
              {p === 'monthly' ? 'Monthly' : 'Daily'}
            </button>
          ))}
        </div>
        <div className="btn-row perf-period">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous period"
            disabled={!currentStart}
            onClick={() => update({ start: shiftPeriodStart(periodType, currentStart, -1) })}
          >
            ‹
          </button>
          <strong>{board.data?.period.label ?? '…'}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next period"
            disabled={!currentStart}
            onClick={() => update({ start: shiftPeriodStart(periodType, currentStart, 1) })}
          >
            ›
          </button>
          {periodStart ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ start: '' })}>
              Current
            </button>
          ) : null}
        </div>
        {teams.length > 0 ? (
          <select className="input" aria-label="Team" value={teamId} onChange={(e) => update({ team: e.target.value })}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="btn-row chip-scroll perf-chip-row" role="group" aria-label="Leaderboard">
        {LEADERBOARDS.map((b) => (
          <button
            key={b.code}
            type="button"
            className={`chip${boardCode === b.code ? ' chip-active' : ''}`}
            aria-pressed={boardCode === b.code}
            onClick={() => update({ board: b.code === 'overall' ? '' : b.code })}
          >
            {b.title}
          </button>
        ))}
      </div>

      {board.isLoading ? (
        <Spinner />
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => board.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState>No standings. Active staff appear here once they have leads, follow-ups, or quotations.</EmptyState>
      ) : (
        <div className="stack">
          <div className="perf-stats">
            <StatTile icon="👥" label="Leads received" value={totals.leads} />
            <StatTile icon="📅" tone="info" label="Follow-ups done" value={totals.followUps} />
            <StatTile icon="📄" tone="warning" label="Quotations sent" value={totals.quotations} />
            <StatTile icon="🏆" tone="success" label="Orders won" value={totals.won} />
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th className="num">Target</th>
                  <th className="num">Achieved</th>
                  <th className="num">Sales %</th>
                  <th className="num">Lead conv.</th>
                  <th className="num">Follow-ups</th>
                  <th className="num">Quotation conv.</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.membershipId}
                    className={`row-link${r.membershipId === me?.membershipId ? ' perf-row-me' : ''}`}
                    onClick={() => navigate(`/performance/${r.membershipId}`)}
                  >
                    <td>
                      <div className="perf-person">
                        <span className="perf-rank">#{r.rank}</span>
                        <Avatar name={r.name} />
                        <div>
                          <Link to={`/performance/${r.membershipId}`} onClick={(e) => e.stopPropagation()}>
                            {r.name}
                          </Link>
                          <div className="muted small">{[r.designation, r.teamName].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{r.salesTargetMinor === null ? '—' : formatMoney(r.salesTargetMinor)}</td>
                    <td className="num">{formatMoney(r.revenueMinor)}</td>
                    <td className="num">
                      <strong className="perf-text-info">{pct(r.salesAchievementBps ?? r.scoreBps)}</strong>
                    </td>
                    <td className="num">{pct(r.leadConversionBps)}</td>
                    <td className="num">{pct(r.followUpCompletionBps)}</td>
                    <td className="num">{pct(r.quotationConversionBps)}</td>
                    <td>
                      <strong>{pct(r.scoreBps)}</strong> <Badge value={bandTitle(r.scoreBand)} tone={bandTone(r.scoreBand)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
