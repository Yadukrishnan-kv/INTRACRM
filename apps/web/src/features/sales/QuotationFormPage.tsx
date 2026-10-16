import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormActions, FormError, FormGrid, TextArea, TextField } from '../../components/form';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatBps, formatMoney } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { LeadPicker, LeadSummary } from './LeadPicker';
import {
  computeTotals,
  draftAmounts,
  lineFromItem,
  minorToInput,
  newQuotationLine,
  validateQuotationLines,
  type LineErrors,
  type QuotationLineDraft,
} from './logic';
import type { Quotation, QuotationInput, QuotationProduct, QuotationTax } from './types';
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
  if (existing.data && existing.data.status !== 'draft') {
    return (
      <>
        <Link to={`/quotations/${existing.data.id}`} className="back-link">
          ← {existing.data.quotationNumber}
        </Link>
        <EmptyState>Only a draft quotation can be edited.</EmptyState>
      </>
    );
  }
  return (
    <QuotationForm
      key={existing.data?.id ?? 'new'}
      existing={existing.data}
      presetLeadId={params.get('leadId') ?? ''}
      products={catalog.data?.products ?? []}
      taxes={catalog.data?.taxes ?? []}
      catalogError={catalog.isError}
    />
  );
}

function QuotationForm({
  existing, presetLeadId, products, taxes, catalogError,
}: {
  existing?: Quotation;
  presetLeadId: string;
  products: QuotationProduct[];
  taxes: QuotationTax[];
  catalogError: boolean;
}) {
  const navigate = useNavigate();
  const [header, setHeader] = useState<Header>(() => ({
    leadId: existing?.leadId ?? presetLeadId,
    title: existing?.title ?? '',
    validUntilOn: existing?.validUntilOn?.slice(0, 10) ?? '',
    expectedCloseOn: existing?.expectedCloseOn?.slice(0, 10) ?? '',
    notes: existing?.notes ?? '',
    terms: existing?.terms ?? '',
  }));
  const [lines, setLines] = useState<QuotationLineDraft[]>(() =>
    existing?.items.length ? existing.items.map(lineFromItem) : [newQuotationLine(taxes)],
  );
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Header, string>>>({});
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof Header>(key: K, value: Header[K]) => setHeader((h) => ({ ...h, [key]: value }));
  const setLine = (key: string, patch: Partial<QuotationLineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const applyProduct = (line: QuotationLineDraft, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const patch: Partial<QuotationLineDraft> = { productId };
    if (product) {
      if (!line.description.trim()) patch.description = product.name;
      if (product.unitPriceMinor !== null) patch.unitPrice = minorToInput(product.unitPriceMinor);
    }
    setLine(line.key, patch);
  };

  const totals = useMemo(() => computeTotals(lines.map((l) => draftAmounts(l, taxes))), [lines, taxes]);

  const save = useApiMutation(
    (body: QuotationInput) =>
      existing ? salesApi.updateQuotation(existing.id, { ...body, leadId: undefined, version: existing.version }) : salesApi.createQuotation(body),
    {
      success: existing ? 'Quotation updated' : 'Draft quotation saved',
      invalidate: [salesKeys.quotationsAll],
      onSuccess: (q) => navigate(`/quotations/${q.id}`, { replace: true }),
    },
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof Header, string>> = {};
    if (!header.leadId) errs.leadId = 'Choose a lead.';
    if (header.title.trim().length > 160) errs.title = 'At most 160 characters.';
    if (header.notes.trim().length > 2000) errs.notes = 'At most 2000 characters.';
    if (header.terms.trim().length > 4000) errs.terms = 'At most 4000 characters.';
    const result = validateQuotationLines(lines, taxes);
    setFieldErrors(errs);
    setLineErrors(result.errors);
    const msg = Object.keys(errs).length ? 'Fix the highlighted fields.' : result.message;
    setMessage(msg);
    if (msg) return;
    const trimmed = (v: string) => v.trim() || undefined;
    save.mutate({
      leadId: header.leadId,
      title: existing ? header.title.trim() : trimmed(header.title),
      notes: existing ? header.notes.trim() : trimmed(header.notes),
      terms: existing ? header.terms.trim() : trimmed(header.terms),
      validUntilOn: header.validUntilOn || undefined,
      expectedCloseOn: header.expectedCloseOn || undefined,
      items: result.items,
    });
  }

  const back = existing ? `/quotations/${existing.id}` : header.leadId && presetLeadId ? `/leads/${presetLeadId}` : '/quotations';

  return (
    <>
      <Link to={back} className="back-link">
        ← Back
      </Link>
      <PageHeader title={existing ? `Edit ${existing.quotationNumber}` : 'New quotation'} subtitle="Draft quotations can be edited until they are sent." />
      <form className="stack" onSubmit={onSubmit} noValidate>
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

        <section className="card stack">
          <h2>Line items</h2>
          {catalogError ? <p className="muted small">Product catalog unavailable; enter lines manually.</p> : null}
          {lines.map((line, index) => {
            const err = lineErrors[line.key] ?? {};
            const amounts = totals.lines[index];
            return (
              <div key={line.key} className="sales-line">
                <div className="sales-line-head">
                  <strong>Line {index + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  >
                    Delete line
                  </button>
                </div>
                <FormGrid>
                  {products.length ? (
                    <label className="field span-2">
                      <span>Product (optional)</span>
                      <select value={line.productId} onChange={(e) => applyProduct(line, e.target.value)}>
                        <option value="">No product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku ? `${p.sku} · ${p.name}` : p.name}
                            {p.unitPriceMinor !== null ? ` — ${formatMoney(p.unitPriceMinor, p.currency)}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="span-2">
                    <TextField label="Description" required value={line.description} maxLength={240} error={err.description} onValue={(v) => setLine(line.key, { description: v })} />
                  </div>
                </FormGrid>
                <div className="sales-line-grid">
                  <TextField label="Quantity" inputMode="numeric" value={line.quantity} error={err.quantity} onValue={(v) => setLine(line.key, { quantity: v.replace(/[^\d]/g, '') })} />
                  <TextField label="Unit price (₹)" inputMode="decimal" value={line.unitPrice} error={err.unitPrice} onValue={(v) => setLine(line.key, { unitPrice: v })} />
                  <TextField label="Line discount (₹)" inputMode="decimal" value={line.discount} error={err.discount} onValue={(v) => setLine(line.key, { discount: v })} />
                  {taxes.length ? (
                    <div className="field">
                      <span>Line total</span>
                      <strong>{formatMoney(amounts?.lineTotalMinor ?? 0)}</strong>
                    </div>
                  ) : (
                    <TextField label="Tax %" inputMode="decimal" value={line.taxPct} error={err.taxPct} onValue={(v) => setLine(line.key, { taxPct: v })} />
                  )}
                </div>
                {taxes.length ? (
                  <div className="field">
                    <span>Tax</span>
                    <div className="sales-taxes" role="group" aria-label="Taxes">
                      {taxes.map((t) => {
                        const on = line.taxRateIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`chip${on ? ' chip-active' : ''}`}
                            aria-pressed={on}
                            onClick={() =>
                              setLine(line.key, {
                                taxRateIds: on ? line.taxRateIds.filter((id) => id !== t.id) : [...line.taxRateIds, t.id],
                              })
                            }
                          >
                            {t.name || formatBps(t.rateBps)}
                            {t.name ? ` (${formatBps(t.rateBps)})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="muted small">Line total {formatMoney(amounts?.lineTotalMinor ?? 0)}</p>
                )}
              </div>
            );
          })}
          <div>
            <button type="button" className="btn btn-ghost" disabled={lines.length >= 50} onClick={() => setLines((ls) => [...ls, newQuotationLine(taxes)])}>
              + Add line item
            </button>
          </div>
          <dl className="sales-totals">
            <dt>Subtotal</dt>
            <dd>{formatMoney(totals.subtotalMinor)}</dd>
            <dt>Discount</dt>
            <dd>−{formatMoney(totals.discountMinor)}</dd>
            <dt>Tax</dt>
            <dd>{formatMoney(totals.taxMinor)}</dd>
            <dt className="sales-grand">Total</dt>
            <dd className="sales-grand">{formatMoney(totals.totalMinor)}</dd>
          </dl>
        </section>

        <section className="card">
          <FormGrid>
            <div className="span-2">
              <TextArea label="Notes" rows={3} value={header.notes} maxLength={2000} error={fieldErrors.notes} onValue={(v) => set('notes', v)} />
            </div>
            <div className="span-2">
              <TextArea label="Terms" rows={3} value={header.terms} maxLength={4000} error={fieldErrors.terms} onValue={(v) => set('terms', v)} />
            </div>
          </FormGrid>
        </section>

        <FormError message={message} />
        <FormActions>
          <Link className="btn btn-ghost" to={back}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save draft'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
