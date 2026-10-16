import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useCursorList, useDebounced } from '../../lib/hooks';
import { salesApi, type WarrantyListQuery } from './api';
import { salesKeys } from './keys';
import { formatDay, warrantyPeriodLabel, warrantyTone } from './logic';
import { WARRANTY_STATUSES, WARRANTY_STATUS_LABELS } from './types';
import './sales.css';

export function WarrantiesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const leadId = params.get('leadId') ?? '';
  const quotationId = params.get('quotationId') ?? '';
  const [draft, setDraft] = useState(q);
  const debounced = useDebounced(draft.trim());

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

  useEffect(() => {
    if (debounced !== (params.get('q') ?? '')) setParam('q', debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filter: WarrantyListQuery = {
    status: status || undefined,
    q: q || undefined,
    leadId: leadId || undefined,
    quotationId: quotationId || undefined,
  };
  const list = useCursorList(salesKeys.warranties(filter), (cursor) => salesApi.warranties(filter, cursor));
  const createHref = `/warranties/create${leadId || quotationId ? `?${new URLSearchParams({ ...(leadId ? { leadId } : {}), ...(quotationId ? { quotationId } : {}) })}` : ''}`;

  return (
    <>
      <PageHeader
        title="Warranties"
        subtitle="Issue a card after a sale to generate QR, PDF, and a verification URL."
        actions={
          <div className="btn-row">
            <Link className="btn btn-ghost" to="/verify-warranty">
              Verify a card
            </Link>
            {can(P.warrantyCreate) ? (
              <Link className="btn btn-primary" to={createHref}>
                Issue warranty
              </Link>
            ) : null}
          </div>
        }
      />

      {leadId || quotationId ? (
        <p className="muted small">
          Filtered to one {quotationId ? 'quotation' : 'lead'}. <Link to="/warranties">Show all</Link>
        </p>
      ) : null}

      <div className="sales-chips" role="group" aria-label="Status">
        <button type="button" className={`chip${!status ? ' chip-active' : ''}`} aria-pressed={!status} onClick={() => setParam('status', '')}>
          All
        </button>
        {WARRANTY_STATUSES.map((s) => (
          <button key={s} type="button" className={`chip${status === s ? ' chip-active' : ''}`} aria-pressed={status === s} onClick={() => setParam('status', s)}>
            {WARRANTY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder="Search card number, serial or customer"
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Search warranties"
        />
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>
          {status || q ? 'No warranty cards match these filters.' : 'No warranty cards. Issue a card after a sale to generate QR, PDF, and a verification URL.'}
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Coverage</th>
                <th>Serial</th>
                <th>Quotation</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((w) => (
                <tr key={w.id} className="row-link" onClick={() => navigate(`/warranties/${w.id}`)}>
                  <td>
                    <div className="sales-desk-only">
                      <Link to={`/warranties/${w.id}`} onClick={(e) => e.stopPropagation()}>
                        {w.cardNumber}
                      </Link>
                      {w.items[0] ? <div className="muted small">{w.items[0].productName ?? w.items[0].description}</div> : null}
                    </div>
                    <div className="sales-phone-only">
                      <Link to={`/warranties/${w.id}`} onClick={(e) => e.stopPropagation()}>
                        {w.customerName ?? w.cardNumber}
                      </Link>
                      <div className="muted small">
                        {[w.cardNumber, w.items[0] ? (w.items[0].productName ?? w.items[0].description) : ''].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </td>
                  <td className="sales-hide-phone">
                    {w.customerName ?? '—'}
                    {w.leadNumber ? <div className="muted small">{w.leadNumber}</div> : null}
                  </td>
                  <td>
                    <Badge value={w.statusLabel || w.status} tone={warrantyTone(w.status)} />
                  </td>
                  <td>
                    {formatDay(w.warrantyStartOn)} – {formatDay(w.warrantyEndOn)}
                    <div className="muted small">{warrantyPeriodLabel(w.warrantyStartOn, w.warrantyEndOn)}</div>
                  </td>
                  <td>{w.serialNumber ?? '—'}</td>
                  <td>{w.quotationNumber ?? '—'}</td>
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
