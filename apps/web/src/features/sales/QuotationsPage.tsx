import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatCount, formatDateTime, formatMoney } from '../../lib/format';
import { useCursorList } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { displayQuotationTitle, formatDay, predictionLabel, quotationListQuery, quotationTone } from './logic';
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS } from './types';
import './sales.css';

export function QuotationsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = quotationListQuery({
    status: params.get('status') ?? undefined,
    bucket: params.get('bucket') ?? undefined,
    pending: params.get('pending') === 'true',
    leadId: params.get('leadId') ?? undefined,
  });

  const update = (next: { status?: string; bucket?: string; pending?: boolean }) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams();
        const leadId = prev.get('leadId');
        if (leadId) p.set('leadId', leadId);
        if (next.status) p.set('status', next.status);
        if (next.bucket) p.set('bucket', next.bucket);
        if (next.pending) p.set('pending', 'true');
        return p;
      },
      { replace: true },
    );

  const engine = useQuery({ queryKey: salesKeys.engine, queryFn: salesApi.engineDashboard });
  const list = useCursorList(salesKeys.quotations(filter), (cursor) => salesApi.quotations(filter, cursor));
  const selectedBucket = filter.bucket ?? (filter.pending ? 'pending' : null);
  const allSelected = !filter.status && !filter.bucket && !filter.pending;

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle={
          engine.data ? (
            <>Pending value {formatMoney(engine.data.pendingValueMinor)}</>
          ) : (
            'Create a draft, send it, then follow up until it is won or lost.'
          )
        }
        actions={
          can(P.quotationCreate) ? (
            <Link
              className="btn btn-primary"
              to={filter.leadId ? `/quotations/create?leadId=${filter.leadId}` : '/quotations/create'}
            >
              New quotation
            </Link>
          ) : null
        }
      />

      {filter.leadId ? (
        <p className="muted small">
          Showing quotations for one lead. <Link to={`/leads/${filter.leadId}`}>Open lead</Link> ·{' '}
          <Link to="/quotations">Show all</Link>
        </p>
      ) : null}

      {engine.data && engine.data.widgets.length > 0 ? (
        <div className="sales-buckets" role="group" aria-label="Follow-up buckets">
          {engine.data.widgets.map((w) => {
            const active = selectedBucket === w.code;
            return (
              <button
                key={w.code}
                type="button"
                className={`sales-bucket${active ? ' sales-bucket-active' : ''}`}
                aria-pressed={active}
                onClick={() =>
                  active ? update({}) : w.code === 'pending' ? update({ pending: true }) : update({ bucket: w.code })
                }
              >
                <strong>{formatCount(w.count)}</strong>
                <span>{w.title}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="sales-chips chip-scroll" role="group" aria-label="Status">
        <button type="button" className={`chip${allSelected ? ' chip-active' : ''}`} aria-pressed={allSelected} onClick={() => update({})}>
          All
        </button>
        {QUOTATION_STATUSES.map((s) => {
          const active = filter.status === s;
          return (
            <button key={s} type="button" className={`chip${active ? ' chip-active' : ''}`} aria-pressed={active} onClick={() => update({ status: s })}>
              {QUOTATION_STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>
          {allSelected ? 'No quotations yet. Create a draft, send it, then follow up until it is won or lost.' : 'No quotations match this filter.'}
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Quotation</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Prediction</th>
                <th>Expected close</th>
                <th>Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((q) => (
                <tr key={q.id} className="row-link" onClick={() => navigate(`/quotations/${q.id}`)}>
                  <td>
                    <Link to={`/quotations/${q.id}`} onClick={(e) => e.stopPropagation()}>
                      {displayQuotationTitle(q)}
                    </Link>
                    <div className="muted small">{q.quotationNumber}</div>
                  </td>
                  <td>
                    {q.customerName ?? '—'}
                    {q.leadTitle ? <div className="muted small">{q.leadTitle}</div> : null}
                  </td>
                  <td>
                    <Badge value={QUOTATION_STATUS_LABELS[q.status] ?? q.status} tone={quotationTone(q.status)} />
                    {q.closingOverdue ? (
                      <div>
                        <Badge value="close overdue" tone="danger" />
                      </div>
                    ) : q.closingSoon ? (
                      <div>
                        <Badge value="closing soon" tone="warning" />
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{formatMoney(q.totalMinor, q.currency)}</td>
                  <td>{predictionLabel(q)}</td>
                  <td>{q.expectedCloseOn ? formatDay(q.expectedCloseOn) : <span className="muted">—</span>}</td>
                  <td>{q.nextFollowUpAt ? formatDateTime(q.nextFollowUpAt) : <span className="muted">Not scheduled</span>}</td>
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
