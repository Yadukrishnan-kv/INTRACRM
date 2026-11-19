import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { formatCount, formatMoney } from '../../lib/format';
import { salesApi } from './api';
import { salesKeys } from './keys';

/** ₹48.75 L / ₹1.2 Cr style, the way Indian sales teams read totals. */
function compactRupees(minor: number): string {
  const rupees = minor / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return formatMoney(minor);
}

/**
 * Shared "Quotations" module header: icon + title, KPI tiles and the view
 * tabs. Rendered by both the list page and the create/edit form so the tab
 * strip stays visible while switching between them, Stripe/Linear-style.
 *
 * `forceActiveTab` lets the create/edit form light up "+ Create Quotation"
 * without reading (or fighting over) the list page's own URL filter params.
 */
export function QuotationsHeader({
  leadId, forceActiveTab,
}: {
  leadId?: string;
  forceActiveTab?: 'create';
}) {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const summary = useQuery({ queryKey: salesKeys.summary, queryFn: salesApi.quotationSummary });
  const sb = summary.data?.byStatus ?? {};

  const status = forceActiveTab ? null : params.get('status');
  const pending = !forceActiveTab && params.get('pending') === 'true';
  const bucket = forceActiveTab ? null : params.get('bucket');
  const allSelected = !forceActiveTab && !status && !bucket && !pending;

  /** Switching tabs keeps the lead filter, same as the old setSearchParams()-based update(). */
  const withLead = (qs: string) => (leadId ? `${qs}${qs.includes('?') ? '&' : '?'}leadId=${leadId}` : qs);
  const tabs: Array<{ key: string; label: string; count?: number; active: boolean; to: string }> = [
    { key: 'all', label: 'All Quotations', active: allSelected, to: withLead('/quotations') },
    { key: 'draft', label: 'Drafts', count: sb.draft?.count ?? 0, active: status === 'draft', to: withLead('/quotations?status=draft') },
    { key: 'pending', label: 'Pending', count: summary.data?.pending ?? 0, active: pending && !bucket, to: withLead('/quotations?pending=true') },
    { key: 'approved', label: 'Approved', count: sb.approved?.count ?? 0, active: status === 'approved', to: withLead('/quotations?status=approved') },
    { key: 'lost', label: 'Rejected', count: sb.lost?.count ?? 0, active: status === 'lost', to: withLead('/quotations?status=lost') },
    { key: 'won', label: 'Converted', count: sb.won?.count ?? 0, active: status === 'won', to: withLead('/quotations?status=won') },
  ];

  return (
    <>
      <div className="qh">
        <div className="qh-title">
          <span className="qh-icon" aria-hidden>
            📄
          </span>
          <div>
            <h1>Quotations</h1>
            <p className="muted small">Create, manage and track customer quotations</p>
          </div>
        </div>
        <div className="qh-kpis">
          <Kpi icon="📄" tone="neutral" label="Total Quotations" value={formatCount(summary.data?.total ?? 0)} />
          <Kpi icon="🕐" tone="warn" label="Pending" value={formatCount(summary.data?.pending ?? 0)} />
          <Kpi icon="✅" tone="ok" label="Approved" value={formatCount(summary.data?.byStatus.approved?.count ?? 0)} />
          <Kpi icon="📦" tone="accent" label="Converted" value={formatCount(summary.data?.byStatus.won?.count ?? 0)} />
          <Kpi icon="₹" tone="teal" label="Quotation Value" value={compactRupees(summary.data?.totalValueMinor ?? 0)} />
        </div>
      </div>

      <nav className="qtabs" aria-label="Quotation views">
        {tabs.map((t, i) => (
          <Fragment key={t.key}>
            {i === 1 && can(P.quotationCreate) ? (
              <Link
                className={`qtab qtab-create${forceActiveTab === 'create' ? ' qtab-active' : ''}`}
                to={leadId ? `/quotations/create?leadId=${leadId}` : '/quotations/create'}
              >
                + Create Quotation
              </Link>
            ) : null}
            <Link className={`qtab${t.active ? ' qtab-active' : ''}`} aria-current={t.active ? 'page' : undefined} to={t.to}>
              {t.label}
              {t.count !== undefined ? ` (${formatCount(t.count)})` : ''}
            </Link>
          </Fragment>
        ))}
      </nav>
    </>
  );
}

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: 'warn' | 'ok' | 'accent' | 'teal' | 'neutral' }) {
  return (
    <div className={`qkpi qkpi-${tone}`}>
      <span className="qkpi-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
