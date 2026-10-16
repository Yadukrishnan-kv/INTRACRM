import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { ConfirmModal } from '../../components/Modal';
import { Badge, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { perfApi, perfKeys } from './api';
import { Progress, StatTile } from './components';
import {
  forecastTitle,
  forecastTone,
  fraction,
  kindTitle,
  pct,
  signedBalance,
  targetBps,
  targetRate,
  targetTitle,
  targetValue,
} from './logic';
import './performance.css';

/** `/targets/:targetId` — mobile TargetDetailPage (plus delete for `target:manage`). */
export function TargetDetailPage() {
  const { targetId = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({ queryKey: perfKeys.target(targetId), queryFn: () => perfApi.target(targetId) });
  const remove = useApiMutation(() => perfApi.deleteTarget(targetId), {
    success: 'Target deleted.',
    invalidate: [perfKeys.targets],
    onSuccess: () => navigate('/targets', { replace: true }),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const t = query.data!;
  const bps = targetBps(t);
  const bal = signedBalance(t);

  return (
    <>
      <Link to="/targets" className="back-link">
        ← Targets
      </Link>
      <PageHeader
        title={targetTitle(t)}
        subtitle={
          <>
            {t.kinds.map((k) => (
              <Badge key={k} value={kindTitle(k)} tone="info" />
            ))}
            <Badge value={forecastTitle(t.forecastBand)} tone={forecastTone(t.forecastBand)} />
            <Badge value={t.onTrack ? 'On track' : 'Behind'} tone={t.onTrack ? 'success' : 'warning'} />
          </>
        }
        actions={
          can(P.targetManage) ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
              Delete
            </button>
          ) : null
        }
      />
      <div className="stack">
        <section className="card">
          <div className="list-row" style={{ marginBottom: 8 }}>
            <span>
              {targetValue(t, t.achievedValue)} of {targetValue(t, t.targetValue)}
            </span>
            <strong>{pct(bps)}</strong>
          </div>
          <Progress value={fraction(bps)} tone={t.onTrack ? undefined : 'warning'} />
          <p className="muted small" style={{ marginBottom: 0 }}>
            Expected by today {targetValue(t, t.expectedValue)} · Pace {targetRate(t, t.plannedDaily)}/day planned · {t.daysRemaining} day
            {t.daysRemaining === 1 ? '' : 's'} left
          </p>
        </section>

        <div className="perf-stats">
          <StatTile label="Achievement %" value={pct(bps)} />
          <StatTile label="Balance" value={bal < 0 ? `+${targetValue(t, -bal)}` : targetValue(t, bal)} hint={bal < 0 ? 'Surplus' : undefined} />
          <StatTile label="Daily requirement" value={t.dailyRequired === null ? '—' : targetRate(t, t.dailyRequired)} />
          <StatTile
            label="Forecast"
            value={t.forecastValue === null ? '—' : targetValue(t, t.forecastValue)}
            hint={`${pct(t.forecastBps)} · ${forecastTitle(t.forecastBand)}`}
          />
        </div>

        <section className="card">
          <dl className="facts">
            <div>
              <dt>Period</dt>
              <dd>
                {t.periodLabel} · {formatDate(t.periodStart)} – {formatDate(t.periodEnd)}
              </dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{t.scopeName ?? kindTitle(t.scopeType)}</dd>
            </div>
            {t.productName ? (
              <div>
                <dt>Product</dt>
                <dd>
                  {t.productName}
                  {t.productSku ? ` (${t.productSku})` : ''}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Remaining</dt>
              <dd>{bal < 0 ? `Surplus ${targetValue(t, -bal)}` : targetValue(t, t.remaining)}</dd>
            </div>
            <div>
              <dt>Days</dt>
              <dd>
                {t.daysElapsed} of {t.daysTotal} elapsed
              </dd>
            </div>
            <div>
              <dt>Variance vs plan</dt>
              <dd>{targetValue(t, t.variance)}</dd>
            </div>
            {t.notes ? (
              <div className="span-2">
                <dt>Notes</dt>
                <dd className="prewrap">{t.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
      <ConfirmModal
        open={confirm}
        title="Delete this target?"
        message="The target and its progress tracking are removed. This cannot be undone."
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
