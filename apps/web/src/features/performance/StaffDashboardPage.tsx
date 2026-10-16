import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { perfApi, perfKeys } from './api';
import { Avatar, Donut, Progress } from './components';
import {
  bandTitle,
  fraction,
  kpiTone,
  metricValue,
  pct,
  rupeesShort,
  targetBps,
  targetRate,
  targetValue,
} from './logic';
import type { StaffDashboard, Target } from './types';
import './performance.css';

/** Personal dashboard (`/dashboard/me`, and home for `dashboard:self`-only users). */
export function StaffDashboardPage() {
  const { can } = useAuth();
  const query = useQuery({ queryKey: perfKeys.dashboardMine, queryFn: perfApi.dashboardMine, refetchInterval: 60_000 });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const board = query.data!;
  const revenue = board.targets.find((t) => t.metricCode === 'revenue');
  const others = board.targets.filter((t) => t !== revenue);
  const canPerf = can(P.performanceRead);

  return (
    <>
      <PageHeader
        title="My dashboard"
        subtitle={`${board.month.label} · updated ${formatDateTime(board.generatedAt)}`}
        actions={
          <>
            {canPerf ? (
              <Link className="btn btn-ghost" to={`/performance/${board.membership.id}`}>
                Performance score
              </Link>
            ) : null}
            {can(P.dashboardRead) ? (
              <Link className="btn btn-ghost" to="/dashboard">
                Company dashboard
              </Link>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={() => void query.refetch()}>
              Refresh
            </button>
          </>
        }
      />
      <div className="stack">
        <Hero board={board} linkable={canPerf} />

        <section>
          <h2 className="section-title">Today</h2>
          <TodayGrid board={board} />
        </section>

        <SalesTargetCard board={board} target={revenue} canBoard={can(P.targetRead)} />

        {others.length > 0 ? (
          <section className="card">
            <h2 className="perf-section-title">Target tracking</h2>
            <div className="stack" style={{ gap: 10 }}>
              {others.map((t) => (
                <TargetRow key={t.id} target={t} linkable={can(P.targetRead)} />
              ))}
            </div>
            {can(P.targetRead) ? (
              <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <Link to="/targets">View all</Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <h2 className="section-title">Personal KPIs</h2>
          {board.kpis.length === 0 ? (
            <div className="card">
              <EmptyState>KPIs appear once leads and follow-ups are logged.</EmptyState>
            </div>
          ) : (
            <div className="perf-kpis">
              {board.kpis.map((kpi) => {
                const tone = kpiTone(kpi.valueBps);
                return (
                  <div key={kpi.code} className="card perf-kpi">
                    <span className="perf-kpi-title">{kpi.title}</span>
                    <div className="perf-kpi-body">
                      <strong className={`perf-kpi-value perf-text-${tone}`}>{kpi.valueBps === null ? '—' : pct(kpi.valueBps)}</strong>
                      <Progress value={fraction(kpi.valueBps)} tone={tone} />
                      {kpi.detail ? <span className="muted small">{kpi.detail}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </>
  );
}

function Hero({ board, linkable }: { board: StaffDashboard; linkable: boolean }) {
  const m = board.membership;
  const subtitle = [m.designation, m.teamName].filter(Boolean).join(' · ');
  const body = (
    <>
      <div className="perf-hero-top">
        <Avatar name={m.name} />
        <div>
          <h2>{m.name}</h2>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <span className="perf-hero-pill">{board.month.label}</span>
      </div>
      <div className="perf-hero-stats">
        <div>
          <span>Score</span>
          <strong>{pct(m.scoreBps ?? 0)}</strong>
          <small>{bandTitle(m.scoreBand)}</small>
        </div>
        <div>
          <span>Company rank</span>
          <strong>#{m.rank}</strong>
          <small>of {m.rankedOutOf}</small>
        </div>
        <div>
          <span>Team rank</span>
          <strong>{m.teamRank === null ? '—' : `#${m.teamRank}`}</strong>
          <small>{m.teamName ?? 'No team'}</small>
        </div>
      </div>
    </>
  );
  return linkable ? (
    <Link to={`/performance/${m.id}`} className="perf-hero">
      {body}
    </Link>
  ) : (
    <section className="perf-hero">{body}</section>
  );
}

function TodayGrid({ board }: { board: StaffDashboard }) {
  const w = board.widgets;
  const overdue = metricValue(w.follow_ups, 'overdue');
  const tiles = [
    { to: '/tasks?view=overdue', icon: '⚠', tone: 'danger', value: overdue, label: 'Overdue follow-ups', alarm: overdue > 0 },
    { to: '/tasks/calendar', icon: '⏱', tone: 'warning', value: metricValue(w.follow_ups, 'remaining'), label: 'Due today', alarm: false },
    { to: '/leads?scope=mine', icon: '👤', tone: '', value: metricValue(w.leads, 'open'), label: 'Open leads', alarm: false },
    { to: '/quotations', icon: '📄', tone: 'info', value: metricValue(w.quotations, 'open'), label: 'Open quotations', alarm: false },
  ];
  return (
    <div className="perf-kpis">
      {tiles.map((t) => (
        <Link key={t.label} to={t.to} className="card perf-kpi perf-link-card">
          <span className="perf-kpi-head">
            <span className={`perf-kpi-icon${t.tone ? ` perf-kpi-icon-${t.tone}` : ''}`} aria-hidden>
              {t.icon}
            </span>
            <span className="perf-kpi-title">{t.label}</span>
          </span>
          <span className="perf-kpi-foot">
            <strong className={`perf-kpi-value${t.alarm ? ' perf-text-danger' : ''}`}>{t.value}</strong>
          </span>
        </Link>
      ))}
    </div>
  );
}

function SalesTargetCard({ board, target, canBoard }: { board: StaffDashboard; target: Target | undefined; canBoard: boolean }) {
  const sales = board.widgets.sales;
  // Without a revenue target the sales widget still knows the month's numbers.
  const achieved = target?.achievedValue ?? metricValue(sales, 'month');
  const goal = target?.targetValue ?? metricValue(sales, 'target');
  const progress = target ? fraction(targetBps(target)) : goal <= 0 ? 0 : Math.min(achieved / goal, 1);
  const hasTarget = goal > 0;
  const money = !target || target.metricUnit === 'minor_currency';
  return (
    <section className="card">
      <div className="list-row">
        <h2 className="perf-section-title">Sales target</h2>
        {hasTarget && target ? <Badge value={target.onTrack ? 'On track' : 'Behind'} tone={target.onTrack ? 'success' : 'warning'} /> : null}
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>
        {board.month.label}
      </p>
      {!hasTarget ? (
        <p className="muted">No revenue target set for this month yet.</p>
      ) : (
        <div className="perf-figures">
          <Donut value={progress} caption="Achieved" />
          <dl>
            <dt>Achieved</dt>
            <dd className="perf-text-info">{rupeesShort(achieved)}</dd>
            <dt>Target</dt>
            <dd>{rupeesShort(goal)}</dd>
            {target ? (
              <>
                <dt>Need per day</dt>
                <dd>
                  {target.dailyRequired === null ? '—' : money ? rupeesShort(target.dailyRequired) : targetRate(target, target.dailyRequired)}
                </dd>
                <dt>Days left</dt>
                <dd>{target.daysRemaining}</dd>
              </>
            ) : null}
          </dl>
        </div>
      )}
      {canBoard ? (
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <Link to="/targets/sales-board">Sales board</Link>
        </div>
      ) : null}
    </section>
  );
}

function TargetRow({ target, linkable }: { target: Target; linkable: boolean }) {
  const tone = target.onTrack ? 'info' : 'warning';
  const content = (
    <>
      <div className="list-row">
        <strong>{target.metricName}</strong>
        <span className="small">
          <span className="muted">
            {targetValue(target, target.achievedValue)} / {targetValue(target, target.targetValue)}
          </span>{' '}
          <strong className={`perf-text-${tone}`}>{pct(targetBps(target))}</strong>
        </span>
      </div>
      <Progress value={fraction(targetBps(target))} tone={target.onTrack ? undefined : 'warning'} />
    </>
  );
  return linkable ? (
    <Link to={`/targets/${target.id}`} style={{ color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {content}
    </Link>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{content}</div>
  );
}
