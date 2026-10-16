import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useCursorList } from '../../lib/hooks';
import { fieldApi } from './api';
import {
  isOverdue,
  parseVisitFilter,
  VISIT_FILTERS,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_TONE,
  visitFilterLabel,
  visitFilterQuery,
  visitTitle,
} from './logic';

export function SiteVisitsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = parseVisitFilter(params.get('filter'));
  const leadId = params.get('leadId') ?? undefined;

  const list = useCursorList(['site-visits', { filter, leadId }], (cursor) =>
    fieldApi.visits({ ...visitFilterQuery(filter), leadId, cursor }),
  );

  const setFilter = (next: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('filter', next);
      return p;
    });

  const createHref = leadId ? `/visits/create?leadId=${encodeURIComponent(leadId)}` : '/visits/create';

  return (
    <>
      <PageHeader
        title="Site visits"
        subtitle="Schedule a visit, then check in with GPS, photos and feedback."
        actions={
          can(P.siteVisitCreate) ? (
            <Link to={createHref} className="btn btn-primary">
              Schedule visit
            </Link>
          ) : null
        }
      />
      <div className="toolbar chip-scroll" role="group" aria-label="Filter visits">
        {VISIT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${filter === f ? ' chip-active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {visitFilterLabel(f)}
          </button>
        ))}
        {leadId ? (
          <button
            type="button"
            className="chip chip-active"
            onClick={() =>
              setParams((prev) => {
                const p = new URLSearchParams(prev);
                p.delete('leadId');
                return p;
              })
            }
          >
            This lead only ×
          </button>
        ) : null}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>No site visits match this filter.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Visit</th>
                <th>Lead</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>City</th>
                <th>Assignee</th>
                <th>Captured</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((v) => (
                <tr key={v.id} className="row-link" onClick={() => navigate(`/visits/${v.id}`)}>
                  <td>
                    <Link to={`/visits/${v.id}`} onClick={(e) => e.stopPropagation()}>
                      {visitTitle(v)}
                    </Link>
                  </td>
                  <td>
                    {v.leadNumber ?? '—'}
                    <div className="muted small">{v.customerName ?? ''}</div>
                  </td>
                  <td>
                    <Badge value={VISIT_STATUS_LABELS[v.status] ?? v.status} tone={VISIT_STATUS_TONE[v.status]} />
                    {isOverdue(v) ? (
                      <>
                        {' '}
                        <Badge value="overdue" tone="danger" />
                      </>
                    ) : null}
                  </td>
                  <td>{formatDateTime(v.scheduledAt)}</td>
                  <td>{v.city ?? '—'}</td>
                  <td>{v.assigneeName ?? '—'}</td>
                  <td className="small">
                    {[v.checkInLocation ? 'GPS' : null, v.photoCount > 0 ? `${v.photoCount} photos` : null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.hasNextPage ? (
            <div className="table-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
