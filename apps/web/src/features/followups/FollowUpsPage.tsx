import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useCursorList } from '../../lib/hooks';
import { formatCount, formatDateTime, humanize } from '../../lib/format';
import { followUpsApi, keys } from './api';
import { AssigneeFilter, FollowUpStatusBadge } from './components';
import { parseListFilter, toListParams, typeTitle, type StatusView } from './logic';
import { FOLLOW_UP_TYPES, type EngineDashboard, type FollowUpGap } from './types';
import './followups.css';

const VIEWS: Array<{ id: StatusView; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
];

export function FollowUpsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const filter = useMemo(() => parseListFilter(params), [params]);
  const listParams = useMemo(() => toListParams(filter), [filter]);

  const set = (patch: Record<string, string | null>) =>
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

  const dashboard = useQuery({ queryKey: keys.dashboard, queryFn: followUpsApi.dashboard });
  const showGaps = filter.bucket === 'no_follow_up';
  const list = useCursorList(keys.list(listParams), (cursor) => followUpsApi.list(listParams, cursor));

  return (
    <>
      <PageHeader
        title="Follow-ups"
        actions={
          <div className="btn-row">
            <Link className="btn btn-ghost" to="/tasks/calendar">
              Calendar
            </Link>
            {can(P.followUpCreate) ? (
              <Link className="btn btn-primary" to="/tasks/create">
                New follow-up
              </Link>
            ) : null}
          </div>
        }
      />

      {dashboard.data ? (
        <BucketCards
          dashboard={dashboard.data}
          selected={filter.bucket}
          onSelect={(code) => set({ bucket: filter.bucket === code ? null : code, view: filter.bucket === code ? null : 'all' })}
        />
      ) : null}

      <div className="toolbar followups-chips" role="group" aria-label="Status">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`chip${filter.view === v.id ? ' chip-active' : ''}`}
            onClick={() => set({ view: v.id === 'pending' ? null : v.id, bucket: null })}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="toolbar followups-filters">
        <select className="input" aria-label="Type" value={filter.type ?? ''} onChange={(e) => set({ type: e.target.value || null })}>
          <option value="">Any type</option>
          {FOLLOW_UP_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeTitle(t)}
            </option>
          ))}
        </select>
        <AssigneeFilter value={filter.assignee ?? ''} onChange={(v) => set({ assignee: v || null })} />
        <label className="followups-inline">
          <span className="muted small">Due on</span>
          <input className="input" type="date" value={filter.dueOn ?? ''} onChange={(e) => set({ dueOn: e.target.value || null })} />
        </label>
        <div className="followups-range">
          <label className="followups-inline">
            <span className="muted small">From</span>
            <input className="input" type="date" value={filter.dueFrom ?? ''} disabled={!!filter.dueOn} onChange={(e) => set({ dueFrom: e.target.value || null })} />
          </label>
          <label className="followups-inline">
            <span className="muted small">To</span>
            <input className="input" type="date" value={filter.dueTo ?? ''} disabled={!!filter.dueOn} onChange={(e) => set({ dueTo: e.target.value || null })} />
          </label>
        </div>
        {filter.type || filter.assignee || filter.dueOn || filter.dueFrom || filter.dueTo ? (
          <button type="button" className="btn btn-ghost" onClick={() => set({ type: null, assignee: null, dueOn: null, dueFrom: null, dueTo: null })}>
            Clear
          </button>
        ) : null}
      </div>

      {showGaps ? (
        <GapList />
      ) : list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>No follow-ups. Schedule a call, WhatsApp, visit, or meeting.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Follow-up</th>
                <th>Lead</th>
                <th>Due</th>
                <th>Status</th>
                <th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className="row-link" onClick={() => navigate(`/tasks/${item.id}`)}>
                  <td>
                    <Link to={`/tasks/${item.id}`} onClick={(e) => e.stopPropagation()}>
                      {item.title}
                    </Link>
                    <div className="muted small">
                      {typeTitle(item.type)}
                      {item.engineBucket ? ` · ${humanize(item.engineBucket)}` : ''}
                    </div>
                  </td>
                  <td>
                    {item.leadCustomerName ?? item.leadTitle ?? '—'}
                    <div className="muted small">{[item.leadNumber, item.leadCustomerName ? item.leadTitle : null].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{formatDateTime(item.dueAt)}</td>
                  <td>
                    <FollowUpStatusBadge item={item} />
                  </td>
                  <td>{item.assigneeName ?? '—'}</td>
                </tr>
              ))}
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

export function BucketCards({
  dashboard,
  selected,
  onSelect,
}: {
  dashboard: EngineDashboard;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="followups-buckets">
      <div className="followups-bucket-grid">
        {dashboard.widgets.map((w) => (
          <button
            key={w.code}
            type="button"
            className={`card followups-bucket followups-bucket-${w.code}${selected === w.code ? ' followups-bucket-active' : ''}`}
            onClick={() => onSelect(w.code)}
            aria-pressed={selected === w.code}
          >
            <span className="stat-value">{formatCount(w.count)}</span>
            <span className="muted small">{w.title}</span>
          </button>
        ))}
      </div>
      {dashboard.escalation.rules.length > 0 ? (
        <p className="muted small">
          Past manager SLA: {dashboard.escalation.overduePastManagerSla} · past admin SLA: {dashboard.escalation.overduePastAdminSla}
        </p>
      ) : null}
    </div>
  );
}

export function GapList() {
  const gaps = useQuery({ queryKey: keys.gaps, queryFn: followUpsApi.gaps });
  if (gaps.isLoading) return <Spinner />;
  if (gaps.isError) return <ErrorState error={gaps.error} onRetry={() => gaps.refetch()} />;
  const items: FollowUpGap[] = gaps.data ?? [];
  if (items.length === 0) return <EmptyState>Every open lead has a follow-up.</EmptyState>;
  return <GapTable items={items} />;
}

export function GapTable({ items }: { items: FollowUpGap[] }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Lead without a follow-up</th>
            <th>Owner</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.leadId} className="row-link" onClick={() => navigate(`/leads/${g.leadId}`)}>
              <td>
                <Link to={`/leads/${g.leadId}`} onClick={(e) => e.stopPropagation()}>
                  {g.leadTitle}
                </Link>
                <div className="muted small">{g.leadNumber}</div>
              </td>
              <td>{g.ownerName ?? '—'}</td>
              <td className="num">
                {can(P.followUpCreate) ? (
                  <Link className="btn btn-ghost btn-sm" to={`/tasks/create?leadId=${g.leadId}`} onClick={(e) => e.stopPropagation()}>
                    Schedule
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
