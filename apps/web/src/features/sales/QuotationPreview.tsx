import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '../../lib/format';
import { salesApi } from './api';
import { type QuotationTotals } from './logic';
import type { QuotationSpec } from './types';

export type PreviewLine = {
  itemCode: string;
  description: string;
  width: string;
  height: string;
  quantity: number;
  unitPriceMinor: number;
};

export type QuotationPreviewProps = {
  quotationNumber: string;
  leadId: string;
  lines: PreviewLine[];
  charges: Array<{ description: string; amountMinor: number }>;
  totals: QuotationTotals;
  gstInclusive: boolean;
  gstPct: string;
  specs: QuotationSpec[];
  terms: string;
  companyName: string;
  address: string;
  bankDetails: string;
  validUntilOn?: string;
};

/** On-screen mock-up of the customer PDF, updated as the form changes. */
export function QuotationPreview(p: QuotationPreviewProps) {
  const lead = useQuery({
    queryKey: ['sales-lead', p.leadId],
    queryFn: () => salesApi.lead(p.leadId),
    enabled: !!p.leadId,
  });
  const company = p.companyName.trim() || 'INTRA CRM';
  const terms = p.terms.split('\n').map((t) => t.trim()).filter(Boolean);
  const bank = p.bankDetails.split('\n').map((t) => t.trim()).filter(Boolean);
  const specs = p.specs.filter((s) => s.label.trim());
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const money = (minor: number) => formatMoney(minor).replace('₹', '');
  return (
    <aside className="qp" aria-label="Quotation preview">
      <h2 className="qp-heading">Quotation preview</h2>
      <div className="qp-sheet">
        <div className="qp-head">
          <img className="qp-logo" src="/logo.png" alt={company} />
          <span className="qp-title">QUOTATION</span>
        </div>
        <div className="qp-info">
          <div>
            <div>Customer: {lead.data?.customerName ?? '—'}</div>
            <div>Phone: {lead.data?.primaryPhone ?? ''}</div>
            <div>Location: {lead.data?.city ?? ''}</div>
          </div>
          <div className="qp-right">
            <div>No: {p.quotationNumber || 'Assigned on save'}</div>
            <div>Date: {today}</div>
            {p.validUntilOn ? <div>Valid Until: {new Date(p.validUntilOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div> : null}
          </div>
        </div>
        <table className="qp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Description</th>
              <th>W×H</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{l.itemCode}</td>
                <td className="qp-desc">{l.description.split('\n').filter((x) => x.trim()).map((x, k) => <div key={k}>• {x.trim()}</div>)}</td>
                <td>{l.width || l.height ? `${l.width || '—'}×${l.height || '—'}` : ''}</td>
                <td>{money(l.unitPriceMinor)}</td>
                <td>{l.quantity}</td>
                <td>{money(l.unitPriceMinor * l.quantity)}</td>
              </tr>
            ))}
            {p.charges.map((c, i) => (
              <tr key={`c${i}`}>
                <td />
                <td colSpan={5}>{c.description}</td>
                <td>{money(c.amountMinor)}</td>
              </tr>
            ))}
            <tr className="qp-sub">
              <td colSpan={6}>SUB TOTAL</td>
              <td>{money(p.totals.subtotalMinor)}</td>
            </tr>
          </tbody>
        </table>
        <div className="qp-sum">
          <div className="qp-bank">
            <strong>{company}</strong>
            {bank.map((b, i) => (
              <div key={i}>{b}</div>
            ))}
          </div>
          <div className="qp-totals">
            <div><span>DISCOUNT</span><span>{money(p.totals.discountMinor)}</span></div>
            {!p.gstInclusive ? <div><span>GST ({p.gstPct}%)</span><span>{money(p.totals.taxMinor)}</span></div> : null}
            <div className="qp-grand"><span>GRAND TOTAL</span><strong>{formatMoney(p.totals.totalMinor).replace('₹', '')}</strong></div>
          </div>
        </div>
        {specs.length ? (
          <div className="qp-specs">
            <div className="qp-bar">PRODUCT SPECIFICATION AND TECHNICAL DETAILS</div>
            {specs.map((s, i) => (
              <div key={i} className="qp-spec">
                <span>{s.label}</span>
                <span>{s.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {terms.length ? (
          <div className="qp-terms">
            <strong>TERMS AND CONDITIONS</strong>
            {terms.map((t, i) => (
              <div key={i}>{/^\d+[.)]/.test(t) ? t : `${i + 1}. ${t}`}</div>
            ))}
          </div>
        ) : null}
        <div className="qp-sign">
          Authorized Signatory
          <strong>{company}</strong>
        </div>
        {p.address ? <div className="qp-foot">{p.address}</div> : null}
      </div>
    </aside>
  );
}
