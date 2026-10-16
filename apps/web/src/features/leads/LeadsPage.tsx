import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDate, formatMoney, humanize } from '../../lib/format';
import { useCursorList, useDebounced } from '../../lib/hooks';
import { leadKeys, leadsApi, type LeadListFilters } from './api';
import { applyScope, displayName, qualityTone, relativeTime, type LeadScope } from './logic';
import { LEAD_STATUSES, type LeadStatus } from './types';
import './leads.css';

const SCOPES: Array<{ id: LeadScope; label: string }> = [
  { id: 'all', label: 'All leads' },
  { id: 'mine', label: 'My leads' },
  { id: 'unassigned', label: 'Unassigned' },
];

export function LeadsPage() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const status = (params.get('status') ?? '') as LeadStatus | '';
  const quality = params.get('quality') ?? '';
  const sourceId = params.get('source') ?? '';
  const ownerParam = params.get('owner') ?? '';
  const scopeParam = params.get('scope');
  const scope: LeadScope = scopeParam === 'mine' || scopeParam === 'unassigned' ? scopeParam : 'all';
  const [draft, setDraft] = useState(q);
  const debounced = useDebounced(draft.trim(), 300);

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

  // Push the debounced search text into the URL so every keystroke isn't a request.
  useEffect(() => {
    if (debounced === (params.get('q') ?? '')) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set('q', debounced);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [debounced, params, setParams]);

  const lookups = useQuery({ queryKey: leadKeys.lookups, queryFn: leadsApi.lookups, staleTime: 5 * 60_000 });

  const ownerMembershipId = scope === 'mine' ? (me?.membershipId ?? '') : scope === 'all' ? ownerParam : '';
  const filters: LeadListFilters = {
    q: q || undefined,
    status: status || undefined,
    quality: quality || undefined,
    sourceId: sourceId || undefined,
    ownerMembershipId: ownerMembershipId || undefined,
  };
  const list = useCursorList(leadKeys.list(filters), (cursor) => leadsApi.list(filters, cursor));
  const leads = useMemo(() => applyScope(list.items, scope, me?.membershipId), [list.items, scope, me?.membershipId]);
  const hasFilters = !!(q || status || quality || sourceId || ownerParam || scope !== 'all');

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Capture, qualify and follow up customer demand."
        actions={
          <>
            <Link className="btn btn-ghost" to="/search">
              Search
            </Link>
            <Link className="btn btn-ghost" to="/pipeline">
              Pipeline
            </Link>
            {can(P.leadCreate) ? (
              <Link className="btn btn-primary" to="/leads/create">
                Add lead
              </Link>
            ) : null}
          </>
        }
      />

      <div className="btn-row leads-scopes" role="group" aria-label="Lead scope">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${scope === s.id ? ' chip-active' : ''}`}
            aria-pressed={scope === s.id}
            onClick={() => setParam('scope', s.id === 'all' ? '' : s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="toolbar leads-toolbar">
        <input
          type="search"
          className="input"
          placeholder="Search name, number, phone or email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Search leads"
        />
        <select className="input" value={status} aria-label="Filter by status" onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <select className="input" value={quality} aria-label="Filter by quality" onChange={(e) => setParam('quality', e.target.value)}>
          <option value="">All qualities</option>
          {(lookups.data?.qualities ?? []).map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
        <select className="input" value={sourceId} aria-label="Filter by source" onChange={(e) => setParam('source', e.target.value)}>
          <option value="">All sources</option>
          {(lookups.data?.sources ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={ownerMembershipId}
          aria-label="Filter by owner"
          disabled={scope !== 'all'}
          onChange={(e) => setParam('owner', e.target.value)}
        >
          <option value="">All owners</option>
          {(lookups.data?.staff ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
        {hasFilters ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDraft('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : leads.length === 0 && !list.hasNextPage ? (
        <EmptyState>{hasFilters ? 'No leads match these filters.' : 'No leads yet. Create a lead to capture customer demand.'}</EmptyState>
      ) : (
        <>
        <ul className="leads-cards" aria-label="Leads">
          {leads.map((lead) => (
            <li key={lead.id} className="card leads-card">
              <div className="list-row">
                <Link to={`/leads/${lead.id}`} className="leads-card-title">
                  {displayName(lead)}
                </Link>
                <span className="muted small">{relativeTime(lead.lastActivityAt ?? lead.updatedAt)}</span>
              </div>
              <div className="btn-row">
                <Badge value={lead.stageName} tone={lead.lifecycleStatus === 'won' ? 'success' : lead.lifecycleStatus === 'lost' ? 'danger' : 'info'} />
                {lead.quality ? <Badge value={humanize(lead.quality)} tone={qualityTone(lead.quality)} /> : null}
              </div>
              <div className="muted small">
                {[lead.sourceName, lead.city, lead.requirement ?? lead.title].filter(Boolean).join(' · ')}
              </div>
              <div className="list-row">
                <span className="small">
                  📅 {lead.nextFollowUpAt ? `Next follow-up ${formatDate(lead.nextFollowUpAt)}` : 'No follow-up scheduled'}
                </span>
                {lead.primaryPhone ? (
                  <a className="btn btn-ghost btn-sm leads-card-call" href={`tel:${lead.primaryPhone}`} aria-label={`Call ${displayName(lead)}`}>
                    <span aria-hidden>📞</span> Call
                  </a>
                ) : null}
              </div>
            </li>
          ))}
          {list.hasNextPage ? (
            <li>
              <button type="button" className="btn btn-ghost leads-more" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </li>
          ) : null}
        </ul>
        <div className="card table-wrap leads-table">
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Customer</th>
                <th>Stage</th>
                <th>Quality</th>
                <th>Source</th>
                <th>Owner</th>
                <th className="num">Value</th>
                <th>Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="row-link" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <td>
                    <Link to={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()}>
                      {lead.title}
                    </Link>
                    <div className="muted small">
                      {lead.leadNumber}
                      {lead.city ? ` · ${lead.city}` : ''}
                    </div>
                  </td>
                  <td>
                    {displayName(lead)}
                    {lead.primaryPhone ? (
                      <div className="small">
                        <a href={`tel:${lead.primaryPhone}`} onClick={(e) => e.stopPropagation()}>
                          {lead.primaryPhone}
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div>{lead.stageName}</div>
                    <Badge value={lead.lifecycleStatus} />
                  </td>
                  <td>{lead.quality ? <Badge value={humanize(lead.quality)} tone={qualityTone(lead.quality)} /> : '—'}</td>
                  <td>{lead.sourceName ?? '—'}</td>
                  <td>{lead.ownerName ?? <span className="muted">Unassigned</span>}</td>
                  <td className="num">{formatMoney(lead.estimatedValueMinor, lead.currency)}</td>
                  <td>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : <span className="muted">Not scheduled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 ? <EmptyState>No matching leads on the loaded pages yet.</EmptyState> : null}
          {list.hasNextPage ? (
            <div className="table-footer">
              <button type="button" className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
        </>
      )}
    </>
  );
}
