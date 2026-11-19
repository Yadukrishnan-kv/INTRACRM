import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormActions, FormError, FormGrid, TextArea, TextField } from '../../components/form';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { LeadPicker, LeadSummary } from './LeadPicker';
import { QuotationPreview } from './QuotationPreview';
import {
  bpsToPct,
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
import type { Quotation, QuotationCatalog, QuotationInput, QuotationProduct, QuotationSpec } from './types';
import './sales.css';

type Header = { leadId: string; title: string; validUntilOn: string; expectedCloseOn: string; notes: string; terms: string };

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
      <dt>Items total</dt>
      <dd>{formatMoney(totals.lines.reduce((s, l) => s + l.extendedMinor, 0))}</dd>
      {charges.map((c, i) =>
        (totals.charges[i]?.extendedMinor ?? 0) > 0 ? (
          <FragmentRow key={c.key} label={c.description} value={formatMoney(totals.charges[i]!.extendedMinor)} />
        ) : null,
      )}
      <dt>Subtotal</dt>
      <dd>{formatMoney(totals.subtotalMinor)}</dd>
      <dt>Discount</dt>
      <dd>−{formatMoney(totals.discountMinor)}</dd>
      <dt>{gstInclusive ? `GST (${gstPct}% included)` : `GST (${gstPct}%)`}</dt>
      <dd>{formatMoney(totals.taxMinor)}</dd>
      {!customerView && hasCost ? (
        <FragmentRow label="Profit after discount" value={formatMoney(profit)} />
      ) : null}
      <dt className="sales-grand">Grand total</dt>
      <dd className="sales-grand">{formatMoney(totals.totalMinor)}</dd>
    </dl>
  );

  return (
    <>
      <Link to={back} className="back-link">
        ← Back
      </Link>
      <PageHeader
        title={existing ? `${isDraft(existing) ? 'Edit' : 'Revise'} ${existing.quotationNumber}` : 'New quotation'}
        subtitle={
          isRevision
            ? `Saving creates revision ${existing!.revision + 1}; the previous figures are kept in the revision history.`
            : 'Enter the purchase price and margin, or type the selling price directly.'
        }
        actions={
          <div className="btn-row" role="group" aria-label="View">
            <button type="button" className={`chip${!customerView ? ' chip-active' : ''}`} aria-pressed={!customerView} onClick={() => setCustomerView(false)}>
              Internal view (cost &amp; margin)
            </button>
            <button type="button" className={`chip${customerView ? ' chip-active' : ''}`} aria-pressed={customerView} onClick={() => setCustomerView(true)}>
              Customer view (final quote)
            </button>
          </div>
        }
      />
      <div className="quote-layout">
      <form className="stack" onSubmit={(e) => onSubmit(e)} noValidate>
        <section className="card">
          <FormGrid>
            {existing || presetLeadId ? (
              <LeadSummary leadId={header.leadId} />
            ) : (
              <LeadPicker value={header.leadId} onChange={(v) => set('leadId', v)} error={fieldErrors.leadId} required />
            )}
            <div className="span-2">
              <TextField label="Quotation title" value={header.title} maxLength={160} error={fieldErrors.title} onValue={(v) => set('title', v)} placeholder="Optional" />
            </div>
            <TextField label="Valid until" type="date" value={header.validUntilOn} onValue={(v) => set('validUntilOn', v)} hint="Optional" />
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
            <div className="sales-pad-foot">{summary}</div>
          </section>
        ) : (
          <section className="card stack">
            <h2>Item details</h2>
            {catalogError ? <p className="muted small">Product catalog unavailable; enter lines manually.</p> : null}
            {lines.map((line, index) => {
              const err = lineErrors[line.key] ?? {};
              const unit = draftUnitPriceMinor(line, step);
              const computed = line.purchasePrice.trim() !== '';
              return (
                <div key={line.key} className="sales-line">
                  <div className="sales-line-head">
                    <strong>Item {index + 1}</strong>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                      Delete item
                    </button>
                  </div>
                  <FormGrid>
                    {products.length ? (
                      <label className="field span-2">
                        <span>Add from product (optional)</span>
                        <select value={line.productId} onChange={(e) => applyProduct(line, e.target.value)}>
                          <option value="">No product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku ? `${p.sku} · ${p.name}` : p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <TextField label="Item code" value={line.itemCode} maxLength={40} onValue={(v) => setLine(line.key, { itemCode: v })} placeholder="e.g. KW2" />
                    <div className="span-2">
                      <TextArea label="Description (one point per line)" required rows={3} value={line.description} maxLength={1000} error={err.description} onValue={(v) => setLine(line.key, { description: v })} />
                    </div>
                  </FormGrid>
                  <div className="sales-line-grid">
                    <TextField label="Width" inputMode="decimal" value={line.width} error={err.width} onValue={(v) => setLine(line.key, { width: v })} />
                    <TextField label="Height" inputMode="decimal" value={line.height} error={err.height} onValue={(v) => setLine(line.key, { height: v })} />
                    <TextField label="Unit" value={line.unit} maxLength={20} onValue={(v) => setLine(line.key, { unit: v })} />
                    <TextField label="Quantity" inputMode="numeric" value={line.quantity} error={err.quantity} onValue={(v) => setLine(line.key, { quantity: v.replace(/[^\d]/g, '') })} />
                  </div>
                  <div className="sales-line-grid">
                    <TextField label="Purchase price (₹)" inputMode="decimal" value={line.purchasePrice} error={err.purchasePrice} onValue={(v) => setLine(line.key, { purchasePrice: v })} hint="Internal — vendor's price" />
                    <TextField label="Margin %" inputMode="decimal" value={line.marginPct} error={err.marginPct} onValue={(v) => setLine(line.key, { marginPct: v })} />
                    {computed ? (
                      <div className="field">
                        <span>Unit price (rounded up)</span>
                        <strong>{formatMoney(unit)}</strong>
                      </div>
                    ) : (
                      <TextField label="Unit price (₹)" inputMode="decimal" value={line.unitPrice} error={err.unitPrice} onValue={(v) => setLine(line.key, { unitPrice: v })} hint="Used when there is no purchase price" />
                    )}
                    <div className="field">
                      <span>Total</span>
                      <strong>{formatMoney(unit * (Number(line.quantity) || 1))}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <button type="button" className="btn btn-ghost" disabled={lines.length >= 50} onClick={() => setLines((ls) => [...ls, newQuotationLine()])}>
                + Add item
              </button>
            </div>
            <p className="muted small">
              Pricing formula: unit price = purchase price + margin %, rounded up to the next ₹{(step / 100).toLocaleString('en-IN')}.
            </p>
          </section>
        )}

        <section className="card stack">
          <h2>Additional charges</h2>
          {charges.map((c) => (
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
          ))}
          <div>
            <button type="button" className="btn btn-ghost" disabled={charges.length >= 20} onClick={() => setCharges((cs) => [...cs, { key: `c${Date.now()}${cs.length}`, description: '', amount: '' }])}>
              + Add charge
            </button>
          </div>
        </section>

        <section className="card stack">
          <h2>Tax &amp; discount</h2>
          <div className="field">
            <span>GST treatment</span>
            <div className="sales-taxes" role="radiogroup" aria-label="GST treatment">
              {([true, false] as const).map((inclusive) => (
                <button key={String(inclusive)} type="button" role="radio" aria-checked={gstInclusive === inclusive} className={`chip${gstInclusive === inclusive ? ' chip-active' : ''}`} onClick={() => setGstInclusive(inclusive)}>
                  {inclusive ? 'Inclusive of GST (recommended)' : 'Exclusive of GST'}
                </button>
              ))}
            </div>
          </div>
          <FormGrid>
            <TextField label="GST %" inputMode="decimal" value={gstPct} onValue={setGstPct} />
            <TextField label="Total discount (₹)" inputMode="decimal" value={discount} onValue={setDiscount} hint="Applied to the whole quotation" />
          </FormGrid>
          {!customerView ? summary : null}
        </section>

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
            <div className="span-2">
              <TextArea label="Notes (internal)" rows={3} value={header.notes} maxLength={2000} error={fieldErrors.notes} onValue={(v) => set('notes', v)} />
            </div>
          </FormGrid>
        </section>

        <FormError message={message} />
        <FormActions>
          <Link className="btn btn-ghost" to={back}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-ghost" disabled={save.isPending || saveAndSend.isPending}>
            {save.isPending ? 'Saving…' : existing ? (isRevision ? 'Save revision' : 'Save changes') : 'Save as draft'}
          </button>
          {!existing || isDraft(existing) ? (
            <button type="button" className="btn btn-primary" disabled={save.isPending || saveAndSend.isPending} onClick={(e) => onSubmit(e, true)}>
              {saveAndSend.isPending ? 'Sending…' : 'Save & send'}
            </button>
          ) : null}
        </FormActions>
      </form>
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
      />
      </div>
    </>
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
