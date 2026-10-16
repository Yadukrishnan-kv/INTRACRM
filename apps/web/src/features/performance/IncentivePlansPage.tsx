import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { FormError, FormGrid, TextField } from '../../components/form';
import { Modal } from '../../components/Modal';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation, useCursorList } from '../../lib/hooks';
import { perfApi, perfKeys } from './api';
import { bandLabel, bandFromSlab, slabPayoutLabel } from './incentiveDraft';
import { humanize } from '../../lib/format';
import { todayYmd } from './logic';
import type { ComputeResult, IncentivePlan } from './types';
import './performance.css';

const STATUS_TONE: Record<string, string> = { draft: 'warning', active: 'success', archived: 'neutral' };

/** `/incentives/plans` — plans with their slabs and a per-plan "compute this period". */
export function IncentivePlansPage() {
  const { can } = useAuth();
  const canManage = can(P.incentiveManage);
  const [status, setStatus] = useState('');
  const list = useCursorList([...perfKeys.plans, status], (cursor) => perfApi.plans({ status: status || undefined, cursor }));

  return (
    <>
      <PageHeader
        title="Incentive plans"
        subtitle="Attainment bands that turn target achievement into payouts."
        actions={
          <>
            <Link className="btn btn-ghost" to="/reports/incentives">
              Payout report
            </Link>
            {canManage ? (
              <Link className="btn btn-primary" to="/incentives/plans/new">
                New plan
              </Link>
            ) : null}
          </>
        }
      />
      <div className="btn-row chip-scroll perf-chip-row" role="group" aria-label="Plan status">
        {['', 'draft', 'active', 'archived'].map((s) => (
          <button key={s} type="button" className={`chip${status === s ? ' chip-active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? humanize(s) : 'All'}
          </button>
        ))}
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>No incentive plans yet. {canManage ? 'Create a plan to pay reps for hitting their targets.' : ''}</EmptyState>
      ) : (
        <>
          <div className="perf-plans">
            {list.items.map((plan) => (
              <PlanCard key={plan.id} plan={plan} canManage={canManage} />
            ))}
          </div>
          {list.hasNextPage ? (
            <div className="table-footer">
              <button type="button" className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function PlanCard({ plan, canManage }: { plan: IncentivePlan; canManage: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rangeOpen, setRangeOpen] = useState(false);
  const compute = useApiMutation((body: { planId: string; periodStart?: string; periodEnd?: string }) => perfApi.compute(body), {
    success: (r: ComputeResult) => `Computed payouts: ${r.computed}${r.skipped ? ` · Skipped (locked): ${r.skipped}` : ''}`,
    invalidate: [perfKeys.incentives],
    onSuccess: () => {
      setRangeOpen(false);
      // The incentive report reads the rows this just wrote.
      void qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const onCompute = () => {
    // The server cannot infer a custom period, so it needs explicit dates.
    if (plan.periodType === 'custom') setRangeOpen(true);
    else compute.mutate({ planId: plan.id });
  };

  return (
    <article className="card perf-plan">
      <div className="perf-plan-head">
        <h3>{canManage ? <Link to={`/incentives/plans/${plan.id}/edit`}>{plan.name}</Link> : plan.name}</h3>
        <Badge value={plan.status} tone={STATUS_TONE[plan.status]} />
      </div>
      <span className="muted small">
        {plan.metricName} · {humanize(plan.periodType)} · {humanize(plan.basis)}
      </span>
      {plan.description ? <p className="small" style={{ margin: 0 }}>{plan.description}</p> : null}
      {plan.coverageIssues.map((issue) => (
        <div key={issue} className="perf-warning">
          ⚠ <span>{issue}</span>
        </div>
      ))}
      {plan.slabs.length > 0 ? (
        <>
          <strong className="small" style={{ marginTop: 6 }}>
            Slabs
          </strong>
          <ul className="list">
            {plan.slabs.map((slab) => (
              <li key={slab.id}>
                <div className="list-row small">
                  <span>{slab.label ?? bandLabel(bandFromSlab(slab, 0))}</span>
                  <strong>{slabPayoutLabel(slab)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {plan.holdBps > 0 ? <span className="muted small">On hold: {Math.round(plan.holdBps / 100)}%</span> : null}
      {canManage ? (
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/incentives/plans/${plan.id}/edit`)}>
            Edit
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={compute.isPending} onClick={onCompute}>
            {compute.isPending ? 'Computing…' : 'Compute period'}
          </button>
        </div>
      ) : null}
      {rangeOpen ? (
        <ComputeRangeModal
          plan={plan}
          busy={compute.isPending}
          onClose={() => setRangeOpen(false)}
          onSubmit={(periodStart, periodEnd) => compute.mutate({ planId: plan.id, periodStart, periodEnd })}
        />
      ) : null}
    </article>
  );
}

/** Dates for a custom-period plan, defaulting to its effective window capped at today. */
function ComputeRangeModal({
  plan,
  busy,
  onClose,
  onSubmit,
}: {
  plan: IncentivePlan;
  busy: boolean;
  onClose: () => void;
  onSubmit: (start: string, end: string) => void;
}) {
  const today = todayYmd();
  const to = plan.effectiveTo && plan.effectiveTo.slice(0, 10) < today ? plan.effectiveTo.slice(0, 10) : today;
  const from = plan.effectiveFrom.slice(0, 10) > to ? to : plan.effectiveFrom.slice(0, 10);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const error = start && end && start > end ? 'The start date must be on or before the end date.' : null;
  return (
    <Modal
      open
      title={`Compute ${plan.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !start || !end || !!error} onClick={() => onSubmit(start, end)}>
            {busy ? 'Computing…' : 'Compute'}
          </button>
        </>
      }
    >
      <FormGrid>
        <TextField label="From" type="date" value={start} onValue={setStart} />
        <TextField label="To" type="date" value={end} onValue={setEnd} />
      </FormGrid>
      <FormError message={error} />
    </Modal>
  );
}
