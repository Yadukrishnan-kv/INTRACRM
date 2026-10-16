import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { fromLocalInput, TextArea, TextField, toLocalInput } from '../../components/form';
import { ConfirmModal, Modal } from '../../components/Modal';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatBps, formatDateTime, formatMoney } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import {
  addDaysYmd,
  displayQuotationTitle,
  formatDay,
  isDraft,
  isPending,
  predictionLabel,
  predictionPercent,
  quotationItemToInput,
  quotationTone,
  statusActionLabel,
  statusActions,
  warrantyTone,
} from './logic';
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, type Quotation, type QuotationItem } from './types';
import './sales.css';

type Dialog =
  | { kind: 'send' }
  | { kind: 'schedule' }
  | { kind: 'log' }
  | { kind: 'lost' }
  | { kind: 'status'; status: string }
  | { kind: 'delete' }
  | { kind: 'deleteLine'; line: QuotationItem }
  | null;

export function QuotationDetailPage() {
  const { quotationId = '' } = useParams();
  const query = useQuery({ queryKey: salesKeys.quotation(quotationId), queryFn: () => salesApi.quotation(quotationId) });
  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <QuotationDetail q={query.data!} />;
}

function QuotationDetail({ q }: { q: Quotation }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const invalidate = [salesKeys.quotationsAll];
  const opts = (success: string) => ({ success, invalidate, onSuccess: close });

  const send = useApiMutation(
    (body: { nextFollowUpAt?: string; expectedCloseOn?: string; notes?: string }) =>
      salesApi.sendQuotation(q.id, { version: q.version, ...body }),
    opts('Quotation sent'),
  );
  const followUp = useApiMutation(
    (body: { nextFollowUpAt?: string; expectedCloseOn?: string; note?: string; logged?: boolean }) =>
      salesApi.quotationFollowUp(q.id, { version: q.version, ...body }),
    opts('Follow-up saved'),
  );
  const status = useApiMutation(
    (body: { status: string; reason?: string }) => salesApi.changeQuotationStatus(q.id, { version: q.version, ...body }),
    opts('Status updated'),
  );
  const remove = useApiMutation(() => salesApi.deleteQuotation(q.id), {
    success: 'Draft quotation deleted',
    invalidate,
    onSuccess: () => navigate('/quotations', { replace: true }),
  });
  const deleteLine = useApiMutation(
    (line: QuotationItem) =>
      salesApi.updateQuotation(q.id, {
        version: q.version,
        items: q.items.filter((r) => r.id !== line.id).map(quotationItemToInput),
      }),
    opts('Line deleted'),
  );

  const warranties = useQuery({
    queryKey: salesKeys.warranties({ quotationId: q.id }),
    queryFn: () => salesApi.warranties({ quotationId: q.id }).then((r) => r.data),
    enabled: can(P.warrantyRead),
  });

  const canEdit = isDraft(q) && can(P.quotationCreate);
  const canSend = can(P.quotationSend);
  const next = can(P.quotationAccept) ? statusActions(q) : [];
  const canIssueWarranty = can(P.warrantyCreate) && (q.status === 'approved' || q.status === 'won');
  const busy = send.isPending || followUp.isPending || status.isPending || remove.isPending || deleteLine.isPending;
  const currentIndex = QUOTATION_STATUSES.indexOf(q.status as (typeof QUOTATION_STATUSES)[number]);

  return (
    <>
      <Link to="/quotations" className="back-link">
        ← Quotations
      </Link>
      <PageHeader
        title={displayQuotationTitle(q)}
        subtitle={
          <>
            {q.quotationNumber} <Badge value={QUOTATION_STATUS_LABELS[q.status] ?? q.status} tone={quotationTone(q.status)} /> {formatMoney(q.totalMinor, q.currency)}
          </>
        }
        actions={
          <div className="btn-row">
            {canEdit ? (
              <>
                <Link className="btn btn-ghost" to={`/quotations/${q.id}/edit`}>
                  Edit
                </Link>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: 'delete' })}>
                  Delete
                </button>
              </>
            ) : null}
            {isDraft(q) && canSend ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setDialog({ kind: 'send' })}>
                Send quotation
              </button>
            ) : null}
          </div>
        }
      />

      <div className="detail-grid">
        <section className="card">
          <h2>Details</h2>
          <div className="sales-steps" aria-label="Status progression">
            {QUOTATION_STATUSES.map((s, i) => (
              <span
                key={s}
                aria-current={s === q.status ? 'step' : undefined}
                className={`sales-step${s === q.status ? ' sales-step-current' : i < currentIndex && q.status !== 'lost' ? ' sales-step-done' : ''}`}
              >
                {QUOTATION_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
          <dl className="facts">
            <div>
              <dt>Lead</dt>
              <dd>
                <Link to={`/leads/${q.leadId}`}>{q.leadNumber ? `${q.leadNumber} · ${q.leadTitle ?? ''}` : 'Open lead'}</Link>
              </dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{q.customerName ?? '—'}</dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{q.assigneeName ?? '—'}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{formatDay(q.validUntilOn)}</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>{formatDateTime(q.sentAt)}</dd>
            </div>
            {q.wonAt ? (
              <div>
                <dt>Won</dt>
                <dd>{formatDateTime(q.wonAt)}</dd>
              </div>
            ) : null}
            {q.lostAt ? (
              <div>
                <dt>Lost</dt>
                <dd>{formatDateTime(q.lostAt)}</dd>
              </div>
            ) : null}
          </dl>
          {q.notes?.trim() ? (
            <>
              <h3>Notes</h3>
              <p className="prewrap">{q.notes}</p>
            </>
          ) : null}
          {q.terms?.trim() ? (
            <>
              <h3>Terms</h3>
              <p className="prewrap">{q.terms}</p>
            </>
          ) : null}
          {q.lostReason?.trim() ? (
            <>
              <h3>Loss reason</h3>
              <p className="prewrap">{q.lostReason}</p>
            </>
          ) : null}
        </section>

        <section className="card stack">
          <div>
            <h2>Closing prediction</h2>
            {q.closingPrediction ? (
              <>
                <div className="list-row">
                  <strong>{predictionLabel(q)}</strong>
                </div>
                <div className="bar" style={{ margin: '8px 0' }}>
                  <span style={{ width: `${predictionPercent(q)}%` }} />
                </div>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {q.closingPrediction.reasons.slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">—</p>
            )}
          </div>
          <dl className="facts">
            <div>
              <dt>Expected close date</dt>
              <dd>{q.expectedCloseOn ? formatDay(q.expectedCloseOn) : 'Not set'}</dd>
            </div>
            <div>
              <dt>Next reminder</dt>
              <dd>{q.nextFollowUpAt ? formatDateTime(q.nextFollowUpAt) : 'No reminder scheduled'}</dd>
            </div>
            <div>
              <dt>Last followed up</dt>
              <dd>{formatDateTime(q.lastFollowedUpAt)}</dd>
            </div>
          </dl>
          {q.followUpNote?.trim() ? <p className="prewrap">{q.followUpNote}</p> : null}
          <div className="btn-row">
            {isPending(q) && canSend ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: 'log' })}>
                  Log follow-up
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: 'schedule' })}>
                  Schedule reminder
                </button>
              </>
            ) : null}
            {canIssueWarranty ? (
              <Link className="btn btn-ghost" to={`/warranties/create?leadId=${q.leadId}&quotationId=${q.id}`}>
                Issue warranty
              </Link>
            ) : null}
          </div>
          {next.length ? (
            <div className="btn-row">
              {next.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${s === 'lost' ? 'btn-danger' : s === 'won' ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={busy}
                  onClick={() => setDialog(s === 'lost' ? { kind: 'lost' } : { kind: 'status', status: s })}
                >
                  {statusActionLabel(s, QUOTATION_STATUS_LABELS)}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card span-2 table-wrap">
          <h2 className="sales-pad-head">Line items</h2>
          {q.items.length === 0 ? (
            <EmptyState>No line items</EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Discount</th>
                  <th className="num">Tax</th>
                  <th className="num">Line total</th>
                  {canEdit ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {q.items.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.description}
                      {line.productName ? <div className="muted small">{line.productName}</div> : null}
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatMoney(line.unitPriceMinor, q.currency)}</td>
                    <td className="num">{line.discountMinor ? formatMoney(line.discountMinor, q.currency) : '—'}</td>
                    <td className="num">{line.taxBps ? formatBps(line.taxBps) : '—'}</td>
                    <td className="num">{formatMoney(line.lineTotalMinor, q.currency)}</td>
                    {canEdit ? (
                      <td className="num">
                        <div className="btn-row sales-row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy || q.items.length === 1}
                            title={q.items.length === 1 ? 'Keep at least one line item' : undefined}
                            onClick={() => setDialog({ kind: 'deleteLine', line })}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && q.items.length === 1 ? (
            <p className="muted small sales-pad-note">
              A quotation needs at least one line item, so the last one can't be deleted.
            </p>
          ) : null}
          <div className="sales-pad-foot">
            <dl className="sales-totals">
              <dt>Subtotal</dt>
              <dd>{formatMoney(q.subtotalMinor, q.currency)}</dd>
              <dt>Discount</dt>
              <dd>−{formatMoney(q.discountMinor, q.currency)}</dd>
              <dt>Tax</dt>
              <dd>{formatMoney(q.taxMinor, q.currency)}</dd>
              <dt className="sales-grand">Total</dt>
              <dd className="sales-grand">{formatMoney(q.totalMinor, q.currency)}</dd>
            </dl>
          </div>
        </section>

        {can(P.warrantyRead) && (warranties.data?.length ?? 0) > 0 ? (
          <section className="card span-2">
            <h2>Warranty cards</h2>
            <ul className="list">
              {warranties.data!.map((w) => (
                <li key={w.id}>
                  <div className="list-row">
                    <Link to={`/warranties/${w.id}`}>{w.cardNumber}</Link>
                    <Badge value={w.statusLabel} tone={warrantyTone(w.status)} />
                  </div>
                  <span className="muted small">
                    {formatDay(w.warrantyStartOn)} – {formatDay(w.warrantyEndOn)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {dialog?.kind === 'send' ? (
        <SendDialog q={q} busy={send.isPending} onClose={close} onSubmit={(b) => send.mutate(b)} />
      ) : null}
      {dialog?.kind === 'schedule' ? (
        <ScheduleDialog q={q} busy={followUp.isPending} onClose={close} onSubmit={(b) => followUp.mutate(b)} />
      ) : null}
      {dialog?.kind === 'log' ? (
        <NoteDialog
          title="Log follow-up"
          label="Notes"
          initial={q.followUpNote ?? ''}
          required={false}
          busy={followUp.isPending}
          onClose={close}
          onSubmit={(note) => followUp.mutate({ note: note || undefined, logged: true })}
        />
      ) : null}
      {dialog?.kind === 'lost' ? (
        <NoteDialog
          title="Mark lost"
          label="Loss reason"
          initial={q.lostReason ?? ''}
          required
          danger
          busy={status.isPending}
          onClose={close}
          onSubmit={(reason) => status.mutate({ status: 'lost', reason })}
        />
      ) : null}
      <ConfirmModal
        open={dialog?.kind === 'status'}
        title={dialog?.kind === 'status' ? statusActionLabel(dialog.status, QUOTATION_STATUS_LABELS) : ''}
        message={
          dialog?.kind === 'status'
            ? `Move ${q.quotationNumber} to ${QUOTATION_STATUS_LABELS[dialog.status] ?? dialog.status}?`
            : ''
        }
        busy={status.isPending}
        onClose={close}
        onConfirm={() => dialog?.kind === 'status' && status.mutate({ status: dialog.status })}
      />
      <ConfirmModal
        open={dialog?.kind === 'delete'}
        title="Delete quotation"
        message="Delete this draft quotation?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onClose={close}
        onConfirm={() => remove.mutate(undefined)}
      />
      <ConfirmModal
        open={dialog?.kind === 'deleteLine'}
        title="Delete line"
        message={dialog?.kind === 'deleteLine' ? `Remove “${dialog.line.description}” from this quotation?` : ''}
        confirmLabel="Delete"
        danger
        busy={deleteLine.isPending}
        onClose={close}
        onConfirm={() => dialog?.kind === 'deleteLine' && deleteLine.mutate(dialog.line)}
      />
    </>
  );
}

function SendDialog({
  q, busy, onClose, onSubmit,
}: {
  q: Quotation;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: { nextFollowUpAt?: string; expectedCloseOn?: string }) => void;
}) {
  const [nextAt, setNextAt] = useState('');
  const [close, setClose] = useState(q.expectedCloseOn?.slice(0, 10) ?? '');
  return (
    <Modal
      open
      title="Send quotation"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onSubmit({ nextFollowUpAt: fromLocalInput(nextAt), expectedCloseOn: close || undefined })}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Sending locks {q.quotationNumber} for editing and starts follow-up tracking.
        </p>
        <TextField label="First follow-up (optional)" type="datetime-local" value={nextAt} onValue={setNextAt} />
        <TextField label="Expected close date (optional)" type="date" value={close} onValue={setClose} />
      </div>
    </Modal>
  );
}

function ScheduleDialog({
  q, busy, onClose, onSubmit,
}: {
  q: Quotation;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: { nextFollowUpAt?: string; expectedCloseOn?: string }) => void;
}) {
  // Mobile defaults: reminder in 2 days, close in 14 days when unset.
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 2 * 86_400_000).toISOString()));
  const [close, setClose] = useState(q.expectedCloseOn?.slice(0, 10) ?? addDaysYmd(new Date(), 14));
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      title="Schedule reminder"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              const iso = fromLocalInput(when);
              if (!iso) return setError('Pick a date and time.');
              if (new Date(iso).getTime() < Date.now() - 60_000) return setError('Pick a time in the future.');
              setError(null);
              onSubmit({ nextFollowUpAt: iso, expectedCloseOn: close || undefined });
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <TextField label="Next reminder" type="datetime-local" required value={when} error={error ?? undefined} onValue={setWhen} />
        <TextField label="Expected close date" type="date" value={close} onValue={setClose} />
      </div>
    </Modal>
  );
}

function NoteDialog({
  title, label, initial, required, danger, busy, onClose, onSubmit,
}: {
  title: string;
  label: string;
  initial: string;
  required: boolean;
  danger?: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={() => {
              const value = text.trim();
              if (required && !value) return setError(`${label} is required.`);
              onSubmit(value);
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <TextArea label={label} rows={3} required={required} value={text} maxLength={2000} error={error} onValue={setText} />
    </Modal>
  );
}
