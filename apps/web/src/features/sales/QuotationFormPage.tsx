import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { FormError, FormGrid, TextArea, TextField } from '../../components/form';
import { EmptyState, ErrorState, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { LeadPicker, LeadSummary } from './LeadPicker';
import { QuotationPreview } from './QuotationPreview';
import { QuotationsHeader } from './QuotationsHeader';
import {
  bpsToPct,
  CHARGE_PRESETS,
  chargesFromRows,
  computeTotals,
  draftAmounts,
  draftChargeAmounts,
  draftProfitMinor,
  draftUnitPriceMinor,
  gstBps,
  isDraft,
  isEditable,
  lineFromItem,
  minorToInput,
  newQuotationLine,
  parseRupees,
  presetCharges,
  validateCharges,
  validateQuotationLines,
  type ChargeDraft,
  type LineErrors,
  type QuotationLineDraft,
} from './logic';
import { QUOTATION_STATUS_LABELS, type Quotation, type QuotationCatalog, type QuotationInput, type QuotationProduct, type QuotationSpec } from './types';
import './sales.css';

type Header = { leadId: string; title: string; validUntilOn: string; expectedCloseOn: string; notes: string; terms: string };

/** Icons for the four standard charge rows, in CHARGE_PRESETS order. */
const CHARGE_ICONS = ['🚚', '🔧', '📦', '🧾'];

export function QuotationFormPage() {
  const { quotationId } = useParams();
  const [params] = useSearchParams();
  const catalog = useQuery({ queryKey: salesKeys.quotationCatalog, queryFn: salesApi.quotationCatalog, staleTime: 5 * 60_000 });
  const existing = useQuery({
    queryKey: salesKeys.quotation(quotationId ?? ''),
    queryFn: () => salesApi.quotation(quotationId!),
    enabled: !!quotationId,
  });

  if (catalog.isLoading || existing.isLoading) return <Spinner />;
  if (existing.isError) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (existing.data && !isEditable(existing.data)) {
    return (
      <>
        <Link to={`/quotations/${existing.data.id}`} className="back-link">
          ← {existing.data.quotationNumber}
        </Link>
        <EmptyState>A won or lost quotation can no longer be edited.</EmptyState>
      </>
    );
  }
  return (
    <QuotationForm
      key={existing.data?.id ?? 'new'}
      existing={existing.data}
      presetLeadId={params.get('leadId') ?? ''}
      catalog={catalog.data}
      catalogError={catalog.isError}
    />
  );
}

function QuotationForm({
  existing, presetLeadId, catalog, catalogError,
}: {
  existing?: Quotation;
  presetLeadId: string;
  catalog?: QuotationCatalog;
  catalogError: boolean;
}) {
  const navigate = useNavigate();
  const products: QuotationProduct[] = catalog?.products ?? [];
  const step = catalog?.roundingStepMinor ?? 10_000;
  const [header, setHeader] = useState<Header>(() => ({
    leadId: existing?.leadId ?? presetLeadId,
    title: existing?.title ?? '',
    validUntilOn: existing?.validUntilOn?.slice(0, 10) ?? '',
    expectedCloseOn: existing?.expectedCloseOn?.slice(0, 10) ?? '',
    notes: existing?.notes ?? '',
    terms: existing ? (existing.terms ?? '') : (catalog?.defaultTerms ?? ''),
  }));
  const [lines, setLines] = useState<QuotationLineDraft[]>(() =>
    existing?.items.length ? existing.items.map(lineFromItem) : [newQuotationLine()],
  );
  const [charges, setCharges] = useState<ChargeDraft[]>(() => (existing ? chargesFromRows(existing.charges) : presetCharges()));
  const [discount, setDiscount] = useState(() => (existing?.discountMinor ? minorToInput(existing.discountMinor) : ''));
  const [gstInclusive, setGstInclusive] = useState(existing?.gstInclusive ?? true);
  const [gstPct, setGstPct] = useState(() =>
    bpsToPct(existing?.items[0]?.taxBps ?? catalog?.defaultGstBps ?? 1800),
  );
  const [specs, setSpecs] = useState<QuotationSpec[]>(() => (existing ? existing.specs : (catalog?.defaultSpecs ?? [])).map((s) => ({ ...s })));
  const [customerView, setCustomerView] = useState(false);
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({});
  const [chargeErrors, setChargeErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Header, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const { me } = useAuth();
  const staff = useQuery({ queryKey: salesKeys.staffLookup, queryFn: salesApi.staffLookup, staleTime: 5 * 60_000 });
  const [assignedTo, setAssignedTo] = useState(() => existing?.assignedToMembershipId ?? '');
  useEffect(() => {
    if (!existing && !assignedTo && me?.membershipId) setAssignedTo(me.membershipId);
  }, [existing, assignedTo, me]);

  const set = <K extends keyof Header>(key: K, value: Header[K]) => setHeader((h) => ({ ...h, [key]: value }));
  const setLine = (key: string, patch: Partial<QuotationLineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setCharge = (key: string, patch: Partial<ChargeDraft>) =>
    setCharges((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const applyProduct = (line: QuotationLineDraft, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const patch: Partial<QuotationLineDraft> = { productId };
    if (product) {
      if (!line.description.trim()) patch.description = product.name;
      if (!line.itemCode.trim() && product.sku) patch.itemCode = product.sku;
      if (product.unitPriceMinor !== null && !line.purchasePrice.trim()) patch.unitPrice = minorToInput(product.unitPriceMinor);
    }
    setLine(line.key, patch);
  };

  const taxBps = gstBps(gstPct) ?? 0;
  const discountMinor = parseRupees(discount) ?? 0;
  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => draftAmounts(l, step, taxBps)),
        { charges: charges.map((c) => draftChargeAmounts(c, taxBps)), discountMinor, gstInclusive },
      ),
    [lines, charges, discountMinor, gstInclusive, step, taxBps],
  );
  const profit = draftProfitMinor(lines, step, totals.discountMinor);
  const hasCost = lines.some((l) => l.purchasePrice.trim() !== '');
  const stepRupees = step / 100;
  const formulaExampleUnit = 9153 * 1.1;
  const formulaExampleRounded = Math.ceil(formulaExampleUnit / stepRupees) * stepRupees;

  const save = useApiMutation(
    (body: QuotationInput) =>
      existing ? salesApi.updateQuotation(existing.id, { ...body, leadId: undefined, version: existing.version }) : salesApi.createQuotation(body),
    {
      success: existing ? (isDraft(existing) ? 'Quotation updated' : `Revision ${existing.revision + 1} saved`) : 'Draft quotation saved',
      invalidate: [salesKeys.quotationsAll],
      onSuccess: (q) => navigate(`/quotations/${q.id}`, { replace: true }),
    },
  );

  const saveAndSend = useApiMutation(
    async (body: QuotationInput) => {
      const saved = existing
        ? await salesApi.updateQuotation(existing.id, { ...body, leadId: undefined, version: existing.version })
        : await salesApi.createQuotation(body);
      return salesApi.sendQuotation(saved.id, { version: saved.version });
    },
    {
      success: 'Quotation saved and sent',
      invalidate: [salesKeys.quotationsAll],
      onSuccess: (q) => navigate(`/quotations/${q.id}`, { replace: true }),
    },
  );

  function onSubmit(e: FormEvent, send = false) {
    e.preventDefault();
    const errs: Partial<Record<keyof Header, string>> = {};
    if (!header.leadId) errs.leadId = 'Choose a lead.';
    if (header.title.trim().length > 160) errs.title = 'At most 160 characters.';
    if (header.notes.trim().length > 2000) errs.notes = 'At most 2000 characters.';
    if (header.terms.trim().length > 4000) errs.terms = 'At most 4000 characters.';
    const gstValue = gstBps(gstPct);
    const result = validateQuotationLines(lines, gstValue ?? 0);
    const chargeResult = validateCharges(charges, gstValue ?? 0);
    const discountValue = parseRupees(discount);
    setFieldErrors(errs);
    setLineErrors(result.errors);
    setChargeErrors(chargeResult.errors);
    const msg = Object.keys(errs).length
      ? 'Fix the highlighted fields.'
      : gstValue === null
        ? 'GST % must be 0 to 100.'
        : result.message
          ? result.message
          : Object.keys(chargeResult.errors).length
            ? 'Fix the highlighted charges.'
            : discountValue === null || discountValue < 0
              ? 'Enter a valid total discount.'
              : null;
    setMessage(msg);
    if (msg) return;
    const trimmed = (v: string) => v.trim() || undefined;
    (send ? saveAndSend : save).mutate({
      leadId: header.leadId,
      title: existing ? header.title.trim() : trimmed(header.title),
      notes: existing ? header.notes.trim() : trimmed(header.notes),
      terms: existing ? header.terms.trim() : trimmed(header.terms),
      validUntilOn: header.validUntilOn || undefined,
      expectedCloseOn: header.expectedCloseOn || undefined,
      assignedToMembershipId: assignedTo || undefined,
      items: result.items,
      charges: chargeResult.charges,
      discountMinor: discountValue ?? 0,
      gstInclusive,
      specs: specs.filter((s) => s.label.trim()),
    });
  }

  const back = existing ? `/quotations/${existing.id}` : header.leadId && presetLeadId ? `/leads/${presetLeadId}` : '/quotations';
  const isRevision = !!existing && !isDraft(existing);
  const summary = (
    <dl className="sales-totals">
      <dt>Items Total</dt>
      <dd>{formatMoney(totals.lines.reduce((s, l) => s + l.extendedMinor, 0))}</dd>
      {charges.map((c, i) =>
        i < CHARGE_PRESETS.length || (totals.charges[i]?.extendedMinor ?? 0) > 0 ? (
          <FragmentRow key={c.key} label={c.description} value={formatMoney(totals.charges[i]?.extendedMinor ?? 0)} />
        ) : null,
      )}
      <dt className="sales-subtotal">Subtotal</dt>
      <dd className="sales-subtotal">{formatMoney(totals.subtotalMinor)}</dd>
      <dt>Discount</dt>
      <dd>−{formatMoney(totals.discountMinor)}</dd>
      <dt>{gstInclusive ? 'GST (Inclusive)' : `GST (${gstPct}%)`}</dt>
      <dd>{formatMoney(totals.taxMinor)}</dd>
    </dl>
  );
  const grandTotal = (
    <div className="quote-grand">
      <span>Grand Total</span>
      <strong>{formatMoney(totals.totalMinor)}</strong>
    </div>
  );
  const profitNote =
    !customerView && hasCost ? <p className="quote-profit muted small">Profit after discount: {formatMoney(profit)}</p> : null;
  const lead = useQuery({
    queryKey: ['sales-lead', header.leadId],
    queryFn: () => salesApi.lead(header.leadId),
    enabled: !!header.leadId,
  });
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const statusLabel = existing ? (QUOTATION_STATUS_LABELS[existing.status] ?? existing.status) : 'Draft';
  const busy = save.isPending || saveAndSend.isPending;
  const shareWhatsApp = () => {
    if (!existing) return;
    void salesApi.quotationPdf(existing.id, existing.quotationNumber);
    const phone = (existing.customerPhone ?? '').replace(/\D/g, '');
    const text = `Quotation ${existing.quotationNumber} for ${existing.customerName ?? 'you'}: ${formatMoney(existing.totalMinor, existing.currency)}. Please find the attached PDF.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <>
      <QuotationsHeader forceActiveTab={existing ? undefined : 'create'} leadId={header.leadId || presetLeadId || undefined} />
      <Link to={back} className="back-link">
        ← Back
      </Link>
      <div className="quote-top">
        <div className="quote-top-title">
          <span className="quote-top-icon" aria-hidden>
            📄
          </span>
          <div>
            <h1>{existing ? `${isDraft(existing) ? 'Edit' : 'Revise'} ${existing.quotationNumber}` : 'Create Quotation'}</h1>
            <p className="muted small">
              {isRevision
                ? `Saving creates revision ${existing!.revision + 1}; the previous figures are kept in the revision history.`
                : 'Enter the purchase price and margin, or type the selling price directly.'}
            </p>
          </div>
        </div>
        <div className="quote-toggle" role="group" aria-label="View">
          <button type="button" className={!customerView ? 'on' : ''} aria-pressed={!customerView} onClick={() => setCustomerView(false)}>
            📄 Internal View (Cost &amp; Margin)
          </button>
          <button type="button" className={customerView ? 'on' : ''} aria-pressed={customerView} onClick={() => setCustomerView(true)}>
            👁 Customer View (Final Quote)
          </button>
        </div>
      </div>
      <div className="quote-layout">
      <form className="stack" onSubmit={(e) => onSubmit(e)} noValidate>
        <section className="card stack">
          <h2 className="quote-h">
            <span className="quote-icon" aria-hidden>
              📄
            </span>{' '}
            Quotation Details
          </h2>
          <div className="quote-details">
            <ReadField icon="📄" label="Quotation No." value={existing?.quotationNumber ?? 'Assigned on save'} />
            <ReadField icon="📅" label="Quotation Date" value={today} />
            <div className="field">
              <span>Valid Until</span>
              <div className="quote-icon-input">
                <span aria-hidden>📅</span>
                <input type="date" value={header.validUntilOn} onChange={(e) => set('validUntilOn', e.target.value)} />
              </div>
              <small className="muted">Optional</small>
            </div>
            <ReadField icon="👤" label="Customer Name" value={lead.data?.customerName ?? '—'} />
            <ReadField icon="📞" label="Mobile Number" value={lead.data?.primaryPhone ?? '—'} />
            <ReadField icon="📍" label="Location" value={lead.data?.city ?? '—'} />
            <ReadField icon="🏙️" label="District" value={lead.data?.district ?? '—'} />
            {existing || presetLeadId ? (
              <LeadSummary leadId={header.leadId} />
            ) : (
              <LeadPicker value={header.leadId} onChange={(v) => set('leadId', v)} error={fieldErrors.leadId} required label="Related Lead" />
            )}
            <div className="field">
              <span>Prepared By</span>
              <div className="quote-icon-input">
                <span aria-hidden>🧑</span>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Prepared by">
                  <option value="">{staff.isLoading ? 'Loading…' : 'Unassigned'}</option>
                  {(staff.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                      {s.designation ? ` (${s.designation})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ReadField icon="🏷️" label="Status" value={statusLabel} pill />
          </div>
          <FormGrid>
            <TextField label="Quotation title" value={header.title} maxLength={160} error={fieldErrors.title} onValue={(v) => set('title', v)} placeholder="Optional" />
            <TextField label="Expected close date" type="date" value={header.expectedCloseOn} onValue={(v) => set('expectedCloseOn', v)} hint="Optional" />
          </FormGrid>
        </section>

        {customerView ? (
          <section className="card table-wrap">
            <h2 className="sales-pad-head">Customer view</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Description</th>
                  <th className="num">Size (W×H)</th>
                  <th className="num">Unit price</th>
                  <th className="num">Qty</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const unit = draftUnitPriceMinor(l, step);
                  return (
                    <tr key={l.key}>
                      <td>{i + 1}</td>
                      <td>{l.itemCode || '—'}</td>
                      <td style={{ whiteSpace: 'pre-line' }}>{l.description}</td>
                      <td className="num">{l.width || l.height ? `${l.width || '—'} × ${l.height || '—'}` : '—'}</td>
                      <td className="num">{formatMoney(unit)}</td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{formatMoney(unit * (Number(l.quantity) || 1))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="sales-pad-foot">{summary}{grandTotal}</div>
          </section>
        ) : (
          <section className="card stack">
            <div className="quote-card-head">
              <h2 className="quote-h">Item Details</h2>
              <div className="btn-row">
                <button type="button" className="btn btn-primary btn-sm" disabled={lines.length >= 50} onClick={() => setLines((ls) => [...ls, newQuotationLine()])}>
                  + Add Item
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={lines.length >= 50 || !products.length}
                  title={products.length ? undefined : 'No products in the catalog yet'}
                  onClick={() => setLines((ls) => [...ls, newQuotationLine()])}
                >
                  ⊞ Add from Product
                </button>
              </div>
            </div>
            {catalogError ? <p className="muted small">Product catalog unavailable; enter lines manually.</p> : null}
            <div className="table-wrap">
              <table className="table quote-items">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Description</th>
                    <th>Size (W × H)</th>
                    <th>Unit</th>
                    <th className="num">Purchase Price (₹)</th>
                    <th className="num">Margin %</th>
                    <th className="num">Unit Price (MRP) ₹</th>
                    <th className="num">Qty</th>
                    <th className="num">Total (₹)</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const err = lineErrors[line.key] ?? {};
                    const unit = draftUnitPriceMinor(line, step);
                    const computed = line.purchasePrice.trim() !== '';
                    return (
                      <tr key={line.key}>
                        <td>{index + 1}</td>
                        <td className="quote-desc">
                          {products.length ? (
                            <select aria-label="Add from product" value={line.productId} onChange={(e) => applyProduct(line, e.target.value)}>
                              <option value="">Add from product…</option>
                              {products.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.sku ? `${pr.sku} · ${pr.name}` : pr.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <input aria-label="Item code" placeholder="Item code" maxLength={40} value={line.itemCode} onChange={(e) => setLine(line.key, { itemCode: e.target.value })} />
                          <textarea aria-label="Description" aria-invalid={!!err.description} rows={2} maxLength={1000} placeholder="Description (one point per line)" value={line.description} onChange={(e) => setLine(line.key, { description: e.target.value })} />
                          {err.description ? <small className="field-error">{err.description}</small> : null}
                        </td>
                        <td className="quote-size">
                          <input aria-label="Width" inputMode="decimal" placeholder="W" value={line.width} onChange={(e) => setLine(line.key, { width: e.target.value })} />
                          <span>×</span>
                          <input aria-label="Height" inputMode="decimal" placeholder="H" value={line.height} onChange={(e) => setLine(line.key, { height: e.target.value })} />
                          {err.width || err.height ? <small className="field-error">{err.width ?? err.height}</small> : null}
                        </td>
                        <td>
                          <input aria-label="Unit" maxLength={20} value={line.unit} onChange={(e) => setLine(line.key, { unit: e.target.value })} />
                        </td>
                        <td className="num">
                          <input aria-label="Purchase price" inputMode="decimal" aria-invalid={!!err.purchasePrice} value={line.purchasePrice} onChange={(e) => setLine(line.key, { purchasePrice: e.target.value })} />
                          {err.purchasePrice ? <small className="field-error">{err.purchasePrice}</small> : null}
                        </td>
                        <td className="num">
                          <input aria-label="Margin %" inputMode="decimal" aria-invalid={!!err.marginPct} value={line.marginPct} onChange={(e) => setLine(line.key, { marginPct: e.target.value })} />
                          {err.marginPct ? <small className="field-error">{err.marginPct}</small> : null}
                        </td>
                        <td className="num">
                          {computed ? (
                            <strong>{formatMoney(unit).replace('₹', '')}</strong>
                          ) : (
                            <>
                              <input aria-label="Unit price" inputMode="decimal" aria-invalid={!!err.unitPrice} value={line.unitPrice} onChange={(e) => setLine(line.key, { unitPrice: e.target.value })} />
                              {err.unitPrice ? <small className="field-error">{err.unitPrice}</small> : null}
                            </>
                          )}
                        </td>
                        <td className="num">
                          <input aria-label="Quantity" inputMode="numeric" aria-invalid={!!err.quantity} value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value.replace(/[^\d]/g, '') })} />
                          {err.quantity ? <small className="field-error">{err.quantity}</small> : null}
                        </td>
                        <td className="num">
                          <strong>{formatMoney(unit * (Number(line.quantity) || 1)).replace('₹', '')}</strong>
                        </td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Delete item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="quote-formula">
              <strong>Pricing Formula:</strong> Unit Price = Purchase Price + Margin % &nbsp;|&nbsp; MRP = Round Up to Next ₹{stepRupees.toLocaleString('en-IN')}
              <br />
              Example: ₹9,153 + 10% = ₹{formulaExampleUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} → ₹{formulaExampleRounded.toLocaleString('en-IN')}
            </p>
          </section>
        )}

        <div className="quote-pair">
        <section className="card stack">
          <h2 className="quote-h">Additional Charges</h2>
          {charges.map((c, i) =>
            i < CHARGE_PRESETS.length ? (
              <div key={c.key} className="charge-row">
                <span className="charge-icon" aria-hidden>
                  {CHARGE_ICONS[i]}
                </span>
                <span className="charge-label">{c.description}</span>
                <div className="quote-icon-input charge-amount">
                  <span aria-hidden>₹</span>
                  <input aria-label={c.description} inputMode="decimal" value={c.amount} onChange={(e) => setCharge(c.key, { amount: e.target.value })} />
                </div>
              </div>
            ) : (
              <div key={c.key} className="sales-line-grid">
                <TextField label="Charge" value={c.description} maxLength={160} error={chargeErrors[c.key]} onValue={(v) => setCharge(c.key, { description: v })} />
                <TextField label="Amount (₹)" inputMode="decimal" value={c.amount} onValue={(v) => setCharge(c.key, { amount: v })} />
                <div className="field">
                  <span>&nbsp;</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCharges((cs) => cs.filter((x) => x.key !== c.key))}>
                    Remove
                  </button>
                </div>
              </div>
            ),
          )}
          <div>
            <button type="button" className="btn btn-ghost" disabled={charges.length >= 20} onClick={() => setCharges((cs) => [...cs, { key: `c${Date.now()}${cs.length}`, description: '', amount: '' }])}>
              + Add charge
            </button>
          </div>
        </section>

        <section className="card stack">
          <h2 className="quote-h">Tax &amp; Discount</h2>
          <div className="field">
            <span>
              GST Treatment <span className="quote-info" title="Whether the prices you entered already include GST.">ⓘ</span>
            </span>
            <div className="quote-radio-group" role="radiogroup" aria-label="GST treatment">
              {([true, false] as const).map((inclusive) => (
                <button
                  key={String(inclusive)}
                  type="button"
                  role="radio"
                  aria-checked={gstInclusive === inclusive}
                  className={`quote-radio${gstInclusive === inclusive ? ' quote-radio-on' : ''}`}
                  onClick={() => setGstInclusive(inclusive)}
                >
                  <span className="quote-radio-dot" aria-hidden />
                  {inclusive ? 'Inclusive of GST (Recommended)' : 'Exclusive of GST'}
                </button>
              ))}
            </div>
          </div>
          <FormGrid>
            <TextField label="GST %" inputMode="decimal" value={gstPct} onValue={setGstPct} />
            <TextField label="Discount (₹)" inputMode="decimal" value={discount} onValue={setDiscount} hint="Applied to the whole quotation" />
          </FormGrid>
          <TextArea
            label="Notes (Internal)"
            rows={3}
            value={header.notes}
            maxLength={2000}
            error={fieldErrors.notes}
            onValue={(v) => set('notes', v)}
            placeholder="Site at Koyilandy. Installation after 10 days."
          />
        </section>
        </div>

        <section className="card stack">
          <h2>Product specification</h2>
          {specs.map((row, i) => (
            <div key={i} className="sales-line-grid">
              <TextField label="Label" value={row.label} maxLength={80} onValue={(v) => setSpecs((s) => s.map((r, k) => (k === i ? { ...r, label: v } : r)))} />
              <TextField label="Value" value={row.value} maxLength={160} onValue={(v) => setSpecs((s) => s.map((r, k) => (k === i ? { ...r, value: v } : r)))} />
              <div className="field">
                <span>&nbsp;</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSpecs((s) => s.filter((_, k) => k !== i))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-ghost" disabled={specs.length >= 30} onClick={() => setSpecs((s) => [...s, { label: '', value: '' }])}>
              + Add specification
            </button>
          </div>
        </section>

        <section className="card">
          <FormGrid>
            <div className="span-2">
              <TextArea label="Terms and conditions (one per line)" rows={6} value={header.terms} maxLength={4000} error={fieldErrors.terms} onValue={(v) => set('terms', v)} />
            </div>
          </FormGrid>
        </section>

        <FormError message={message} />
        <div className="quote-actions">
          <Link className="btn btn-ghost" to={back}>
            Cancel
          </Link>
          <span className="quote-spacer" />
          <button type="submit" className="btn btn-ghost" disabled={busy}>
            📄 {save.isPending ? 'Saving…' : existing ? (isRevision ? 'Save Revision' : 'Save Changes') : 'Save as Draft'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => document.getElementById('quote-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            👁 Preview
          </button>
          <button type="button" className="btn btn-ghost" disabled={!existing} title={existing ? undefined : 'Save the quotation first'} onClick={() => existing && void salesApi.quotationPdf(existing.id, existing.quotationNumber)}>
            ⬇ Download PDF
          </button>
          <button type="button" className="btn btn-whatsapp" disabled={!existing} title={existing ? undefined : 'Save the quotation first'} onClick={shareWhatsApp}>
            💬 Share on WhatsApp
          </button>
          {!existing || isDraft(existing) ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={(e) => onSubmit(e, true)}>
              {saveAndSend.isPending ? 'Sending…' : '✈ Save & Send'}
            </button>
          ) : null}
        </div>
      </form>
      <div className="quote-rail">
        <section className="card quote-summary">
          <h2 className="quote-h">Quotation Summary</h2>
          {summary}
          {grandTotal}
          {profitNote}
        </section>
        <div id="quote-preview">
      <QuotationPreview
        quotationNumber={existing?.quotationNumber ?? ''}
        leadId={header.leadId}
        lines={lines.map((l) => ({
          itemCode: l.itemCode,
          description: l.description,
          width: l.width,
          height: l.height,
          quantity: Number(l.quantity) || 1,
          unitPriceMinor: draftUnitPriceMinor(l, step),
        }))}
        charges={charges.map((c) => ({ description: c.description, amountMinor: parseRupees(c.amount) ?? 0 })).filter((c) => c.amountMinor > 0)}
        totals={totals}
        gstInclusive={gstInclusive}
        gstPct={gstPct}
        specs={specs}
        terms={header.terms}
        companyName={catalog?.companyName ?? ''}
        address={catalog?.address ?? ''}
        bankDetails={catalog?.bankDetails ?? ''}
        validUntilOn={header.validUntilOn}
      />
        </div>
      </div>
      </div>
    </>
  );
}

function ReadField({ label, value, icon, pill }: { label: string; value: string; icon?: string; pill?: boolean }) {
  if (pill) {
    return (
      <div className="field">
        <span>{label}</span>
        <div className="quote-pill">
          {icon ? <span aria-hidden>{icon} </span> : null}
          {value}
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="quote-icon-input quote-icon-input-static">
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
