import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { Badge, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { base64ToBlob, formatDay, saveBlob, warrantyItemToInput, warrantyPeriodLabel, warrantyTone } from './logic';
import { WARRANTY_STATUS_LABELS, type Warranty, type WarrantyItem } from './types';
import './sales.css';

export function WarrantyDetailPage() {
  const { warrantyId = '' } = useParams();
  const query = useQuery({ queryKey: salesKeys.warranty(warrantyId), queryFn: () => salesApi.warranty(warrantyId) });
  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <WarrantyDetail w={query.data!} />;
}

type Dialog = { kind: 'status'; status: string } | { kind: 'deleteItem'; item: WarrantyItem } | null;

function WarrantyDetail({ w }: { w: Warranty }) {
  const { can } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [downloading, setDownloading] = useState(false);
  const close = () => setDialog(null);

  const qr = useQuery({ queryKey: salesKeys.warrantyQr(w.id), queryFn: () => salesApi.warrantyQr(w.id), staleTime: 10 * 60_000 });
  const status = useApiMutation((s: string) => salesApi.changeWarrantyStatus(w.id, { version: w.version, status: s }), {
    success: 'Status updated',
    invalidate: [salesKeys.warrantiesAll],
    onSuccess: close,
  });
  const deleteItem = useApiMutation(
    (item: WarrantyItem) =>
      salesApi.updateWarranty(w.id, { version: w.version, items: w.items.filter((r) => r.id !== item.id).map(warrantyItemToInput) }),
    { success: 'Item removed', invalidate: [salesKeys.warrantiesAll], onSuccess: close },
  );

  const canUpdate = can(P.warrantyUpdate) && w.status !== 'void';
  const busy = status.isPending || deleteItem.isPending;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(w.verifyUrl);
      toast.success('Verification URL copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const pdf = await salesApi.warrantyPdf(w.id);
      saveBlob(base64ToBlob(pdf.contentBase64, pdf.mimeType || 'application/pdf'), pdf.fileName ?? `${w.cardNumber}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const first = w.items[0];
  const product = first ? (first.productName ?? first.description) : (w.leadTitle ?? '—');
  const details = [
    w.serialNumber ? `SN ${w.serialNumber}` : '',
    w.quotationNumber ?? '',
    w.coverageNotes ?? '',
    ...w.items.map((l) => [l.description, `Qty ${l.quantity}`, l.serialNumber ? `SN ${l.serialNumber}` : ''].filter(Boolean).join(' · ')),
  ]
    .filter((v) => v.trim())
    .join('\n');
  const qrSrc = qr.data?.contentBase64 ? `data:${qr.data.mimeType || 'image/png'};base64,${qr.data.contentBase64}` : null;

  return (
    <>
      <Link to="/warranties" className="back-link">
        ← Warranties
      </Link>
      <PageHeader
        title="Warranty card"
        subtitle={
          <>
            {w.cardNumber} <Badge value={w.statusLabel || w.status} tone={warrantyTone(w.status)} />
          </>
        }
        actions={
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={copyUrl} aria-label="Copy verification URL" title="Copy verification URL">
              Copy link
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={downloadPdf}
              disabled={downloading}
              aria-label="Download warranty card PDF"
              title="Download warranty card PDF"
            >
              {downloading ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        }
      />

      <div className="detail-grid">
        <section className="card sales-cert sales-cert-full">
          <h2 className="sales-cert-title">INTRA WARRANTY CERTIFICATE</h2>
          <div className="sales-cert-seal" aria-hidden>
            ✓
          </div>
          <div className="sales-cert-tagline">Quality Assured</div>
          <Badge value={w.statusLabel || w.status} tone={warrantyTone(w.status)} />
          <dl className="sales-cert-rows">
            <dt>Customer Name</dt>
            <dd>{w.customerName ?? w.leadTitle ?? w.cardNumber}</dd>
            <dt>Order No.</dt>
            <dd>{w.quotationNumber ?? w.cardNumber}</dd>
            <dt>Product</dt>
            <dd>{product}</dd>
            <dt>Product Details</dt>
            <dd>{details || '—'}</dd>
            <dt>Installation Date</dt>
            <dd>{formatDay(w.warrantyStartOn)}</dd>
            <dt>Warranty Period</dt>
            <dd>
              {warrantyPeriodLabel(w.warrantyStartOn, w.warrantyEndOn)} (until {formatDay(w.warrantyEndOn)})
            </dd>
          </dl>
          <div className="sales-sign">{w.issuedByName ?? 'Authorised Signatory'}</div>
          <div className="sales-cert-foot">
            <span className="muted small">
              For support, scan the QR code or share the verification link with the customer.
              <br />
              <a href={w.verifyUrl} target="_blank" rel="noreferrer" className="sales-break">
                {w.verifyUrl}
              </a>
            </span>
            {qrSrc ? <img className="sales-qr" src={qrSrc} alt={`QR code for ${w.cardNumber}`} /> : <span className="sales-qr sales-qr-empty">{qr.isLoading ? 'Loading…' : 'No QR'}</span>}
          </div>
        </section>

        <section className="card stack">
          <h2>Details</h2>
          <dl className="facts">
            <div>
              <dt>Lead</dt>
              <dd>{w.leadId ? <Link to={`/leads/${w.leadId}`}>{w.leadNumber ?? 'Open lead'}</Link> : '—'}</dd>
            </div>
            <div>
              <dt>Quotation</dt>
              <dd>{w.quotationId ? <Link to={`/quotations/${w.quotationId}`}>{w.quotationNumber ?? 'Open quotation'}</Link> : '—'}</dd>
            </div>
            <div>
              <dt>Purchased on</dt>
              <dd>{formatDay(w.purchasedOn)}</dd>
            </div>
            <div>
              <dt>Serial number</dt>
              <dd>{w.serialNumber ?? '—'}</dd>
            </div>
            <div>
              <dt>Issued by</dt>
              <dd>{w.issuedByName ?? '—'}</dd>
            </div>
          </dl>
          {canUpdate ? (
            <div className="btn-row">
              <Link className="btn btn-ghost" to={`/warranties/${w.id}/edit`}>
                Edit warranty
              </Link>
            </div>
          ) : null}
          {can(P.warrantyUpdate) && w.nextStatuses.length ? (
            <div className="btn-row">
              {w.nextStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${s === 'void' ? 'btn-danger' : 'btn-ghost'}`}
                  disabled={busy}
                  onClick={() => setDialog({ kind: 'status', status: s })}
                >
                  {s === 'void' ? 'Void card' : `Mark ${WARRANTY_STATUS_LABELS[s] ?? s}`}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card span-2">
          <h2>Covered items</h2>
          <ul className="list">
            {w.items.map((item) => (
              <li key={item.id}>
                <div className="list-row">
                  <strong>{item.description}</strong>
                  {canUpdate ? (
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy || w.items.length === 1}
                        title={w.items.length === 1 ? 'Keep at least one covered item' : undefined}
                        onClick={() => setDialog({ kind: 'deleteItem', item })}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
                <span className="muted small">
                  {[`Qty ${item.quantity}`, item.serialNumber ? `SN ${item.serialNumber}` : '', item.productName ?? ''].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          {canUpdate && w.items.length === 1 ? (
            <p className="muted small">A warranty needs at least one covered item, so the last one can't be deleted.</p>
          ) : null}
        </section>
      </div>

      <ConfirmModal
        open={dialog?.kind === 'status'}
        title="Change status"
        message={
          dialog?.kind === 'status'
            ? dialog.status === 'void'
              ? `Void ${w.cardNumber}? Verification will show the card as void.`
              : `Mark ${w.cardNumber} as ${WARRANTY_STATUS_LABELS[dialog.status] ?? dialog.status}?`
            : ''
        }
        danger={dialog?.kind === 'status' && dialog.status === 'void'}
        busy={status.isPending}
        onClose={close}
        onConfirm={() => dialog?.kind === 'status' && status.mutate(dialog.status)}
      />
      <ConfirmModal
        open={dialog?.kind === 'deleteItem'}
        title="Remove covered item"
        message={dialog?.kind === 'deleteItem' ? `Remove “${dialog.item.description}” from this card?` : ''}
        confirmLabel="Remove"
        danger
        busy={deleteItem.isPending}
        onClose={close}
        onConfirm={() => dialog?.kind === 'deleteItem' && deleteItem.mutate(dialog.item)}
      />
    </>
  );
}
