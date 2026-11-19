import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, Spinner } from '../../components/ui';
import { formatCount, formatDateTime, formatMoney } from '../../lib/format';
import { useCursorList } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { displayQuotationTitle, formatDay, predictionLabel, quotationListQuery, quotationTone } from './logic';
import { QUOTATION_STATUS_LABELS } from './types';
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
  const allSelected = !filter.status && !filter.bucket && !filter.pending;
  const list = useCursorList(salesKeys.quotations(filter), (cursor) => salesApi.quotations(filter, cursor));
  const summary = useQuery({ queryKey: salesKeys.summary, queryFn: salesApi.quotationSummary });
  const sb = summary.data?.byStatus ?? {};
  const tabs: Array<{ key: string; label: string; count?: number; active: boolean; onClick: () => void }> = [
    { key: 'all', label: 'All Quotations', active: allSelected, onClick: () => update({}) },
    { key: 'draft', label: 'Drafts', count: sb.draft?.count ?? 0, active: filter.status === 'draft', onClick: () => update({ status: 'draft' }) },
    { key: 'pending', label: 'Pending', count: summary.data?.pending ?? 0, active: !!filter.pending && !filter.bucket, onClick: () => update({ pending: true }) },
    { key: 'approved', label: 'Approved', count: sb.approved?.count ?? 0, active: filter.status === 'approved', onClick: () => update({ status: 'approved' }) },
    { key: 'lost', label: 'Rejected', count: sb.lost?.count ?? 0, active: filter.status === 'lost', onClick: () => update({ status: 'lost' }) },
    { key: 'won', label: 'Converted', count: sb.won?.count ?? 0, active: filter.status === 'won', onClick: () => update({ status: 'won' }) },
  ];
  const selectedBucket = filter.bucket ?? (filter.pending ? 'pending' : null);

  return (
    <>
      <div className="qh">
        <div className="qh-title">
          <span className="qh-icon" aria-hidden>
            ▤
          </span>
          <div>
            <h1>Quotations</h1>
            <p className="muted small">Create, manage and track customer quotations</p>
          </div>
        </div>
        <div className="qh-kpis">
          <Kpi label="Total Quotations" value={formatCount(summary.data?.total ?? 0)} />
          <Kpi label="Pending" value={formatCount(summary.data?.pending ?? 0)} tone="warn" />
          <Kpi label="Approved" value={formatCount(summary.data?.byStatus.approved?.count ?? 0)} tone="ok" />
          <Kpi label="Converted" value={formatCount(summary.data?.byStatus.won?.count ?? 0)} tone="accent" />
          <Kpi label="Quotation Value" value={compactRupees(summary.data?.totalValueMinor ?? 0)} />
        </div>
      </div>

      <nav className="qtabs" aria-label="Quotation views">
        {tabs.map((t, i) => (
          <Fragment key={t.key}>
          {i === 1 && can(P.quotationCreate) ? (
            <Link
              className="qtab qtab-create"
              to={filter.leadId ? `/quotations/create?leadId=${filter.leadId}` : '/quotations/create'}
            >
              + Create Quotation
            </Link>
          ) : null}
          <button type="button" className={`qtab${t.active ? ' qtab-active' : ''}`} aria-pressed={t.active} onClick={t.onClick}>
            {t.label}
            {t.count !== undefined ? ` (${formatCount(t.count)})` : ''}
          </button>
          </Fragment>
        ))}
      </nav>

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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' | 'accent' }) {
  return (
    <div className={`qkpi${tone ? ` qkpi-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** ₹48.75 L / ₹1.2 Cr style, the way Indian sales teams read totals. */
function compactRupees(minor: number): string {
  const rupees = minor / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return formatMoney(minor);
}
