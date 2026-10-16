import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { perfApi, perfKeys, type PerformanceQuery } from './api';
import { Progress, StatTile } from './components';
import { bandTitle, bandTone, fraction, pct } from './logic';
import './performance.css';

/** `/performance/:membershipId` — one person's score card, KPIs and nearby ranks. */
export function PerformanceDetailPage() {
  const { membershipId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const periodType = params.get('period') === 'daily' ? 'daily' : 'monthly';
  const q: PerformanceQuery = { periodType };
  const query = useQuery({ queryKey: perfKeys.performanceOf(membershipId, q), queryFn: () => perfApi.performanceOf(membershipId, q) });

  const card = query.data;
  const s = card?.staff;

  return (
    <>
      <Link to="/performance" className="back-link">
        ← Target & Achievement
      </Link>
      <PageHeader
        title={s?.name ?? 'Performance score'}
        subtitle={
          card && s ? (
            <>
              {card.period.label} <Badge value={bandTitle(s.scoreBand)} tone={bandTone(s.scoreBand)} />
            </>
          ) : undefined
        }
        actions={
          <div className="perf-segment" role="group" aria-label="Period type">
            {(['monthly', 'daily'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={periodType === p} onClick={() => setParams(p === 'daily' ? { period: 'daily' } : {}, { replace: true })}>
                {p === 'monthly' ? 'Monthly' : 'Daily'}
              </button>
            ))}
          </div>
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !card || !s ? null : (
        <div className="stack">
          <div className="perf-stats">
            <StatTile label="Performance score" value={pct(s.scoreBps)} hint={bandTitle(s.scoreBand)} />
            <StatTile label="Rank" value={`#${s.rank} of ${s.rankedOutOf}`} />
            <StatTile label="Team rank" value={s.teamRank === null ? '—' : `#${s.teamRank}`} hint={s.teamName ?? 'No team'} />
          </div>

          <section className="card">
            <h2 className="perf-section-title">KPIs</h2>
            <div className="stack" style={{ gap: 16 }}>
              <Kpi
                title="Lead conversion"
                bps={s.leadConversionBps}
                detail={`${s.leadsWon} won · ${s.leadsLost} lost · ${s.leadsCreated} created`}
              />
              <Kpi
                title="Follow-up completion"
                bps={s.followUpCompletionBps}
                detail={`${s.followUpsCompleted} completed of ${s.followUpsDue} due`}
              />
              <Kpi
                title="Sales achievement"
                bps={s.salesAchievementBps}
                detail={
                  s.salesTargetMinor === null
                    ? 'No membership revenue target this period'
                    : `${formatMoney(s.revenueMinor)} of ${formatMoney(s.salesTargetMinor)}`
                }
              />
              <Kpi
                title="Quotation conversion"
                bps={s.quotationConversionBps}
                detail={`${s.quotationsWon} won · ${s.quotationsLost} lost · ${s.quotationsSent} sent`}
              />
            </div>
          </section>

          {card.neighbors.length > 1 ? (
            <section className="card">
              <h2 className="perf-section-title">Nearby ranks</h2>
              <ul className="list">
                {card.neighbors.map((n) => (
                  <li key={n.membershipId} className={n.membershipId === s.membershipId ? 'perf-row-me' : undefined}>
                    <div className="list-row">
                      {n.membershipId === s.membershipId ? (
                        <strong>
                          #{n.rank} {n.name}
                        </strong>
                      ) : (
                        <Link to={`/performance/${n.membershipId}${periodType === 'daily' ? '?period=daily' : ''}`}>
                          #{n.rank} {n.name}
                        </Link>
                      )}
                      <strong>{pct(n.scoreBps)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function Kpi({ title, bps, detail }: { title: string; bps: number | null; detail: string }) {
  return (
    <div>
      <div className="list-row">
        <div>
          <strong>{title}</strong>
          <div className="muted small">{detail}</div>
        </div>
        <strong>{pct(bps)}</strong>
      </div>
      <div style={{ marginTop: 6 }}>
        <Progress value={fraction(bps)} />
      </div>
    </div>
  );
}
