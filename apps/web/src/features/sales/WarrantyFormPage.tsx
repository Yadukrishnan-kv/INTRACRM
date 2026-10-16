import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormActions, FormError, FormGrid, TextArea, TextField } from '../../components/form';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from './api';
import { salesKeys } from './keys';
import { LeadPicker, LeadSummary } from './LeadPicker';
import {
  impliedWarrantyEnd,
  newWarrantyLine,
  validateWarrantyLines,
  warrantyLineFromItem,
  warrantyLinesFromQuotation,
  warrantyPeriodLabel,
  ymd,
  type WarrantyLineDraft,
} from './logic';
import type { Quotation, Warranty, WarrantyInput, WarrantyProduct } from './types';
import './sales.css';

type Header = { leadId: string; serialNumber: string; purchasedOn: string; warrantyStartOn: string; warrantyEndOn: string; coverageNotes: string };
type LineErr = Partial<Record<'description' | 'quantity' | 'serialNumber', string>>;

export function WarrantyFormPage() {
  const { warrantyId } = useParams();
  const [params] = useSearchParams();
  const quotationId = warrantyId ? '' : (params.get('quotationId') ?? '');
  const catalog = useQuery({ queryKey: salesKeys.warrantyCatalog, queryFn: salesApi.warrantyCatalog, staleTime: 5 * 60_000 });
  const existing = useQuery({
    queryKey: salesKeys.warranty(warrantyId ?? ''),
    queryFn: () => salesApi.warranty(warrantyId!),
    enabled: !!warrantyId,
  });
  const quotation = useQuery({
    queryKey: salesKeys.quotation(quotationId),
    queryFn: () => salesApi.quotation(quotationId),
    enabled: !!quotationId,
  });

  if (catalog.isLoading || existing.isLoading || quotation.isLoading) return <Spinner />;
  if (existing.isError) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (existing.data?.status === 'void') {
    return (
      <>
        <Link to={`/warranties/${existing.data.id}`} className="back-link">
          ← {existing.data.cardNumber}
        </Link>
        <EmptyState>A void warranty card can’t be edited.</EmptyState>
      </>
    );
  }
  return (
    <WarrantyForm
      key={existing.data?.id ?? 'new'}
      existing={existing.data}
      presetLeadId={params.get('leadId') ?? quotation.data?.leadId ?? ''}
      quotationId={quotationId}
      quotation={quotation.data}
      products={catalog.data?.products ?? []}
    />
  );
}

function WarrantyForm({
  existing, presetLeadId, quotationId, quotation, products,
}: {
  existing?: Warranty;
  presetLeadId: string;
  quotationId: string;
  quotation?: Quotation;
  products: WarrantyProduct[];
}) {
  const navigate = useNavigate();
  const [header, setHeader] = useState<Header>(() => ({
    leadId: existing?.leadId ?? presetLeadId,
    serialNumber: existing?.serialNumber ?? '',
    purchasedOn: existing?.purchasedOn?.slice(0, 10) ?? '',
    warrantyStartOn: existing?.warrantyStartOn?.slice(0, 10) ?? ymd(new Date()),
    warrantyEndOn: existing?.warrantyEndOn?.slice(0, 10) ?? '',
    coverageNotes: existing?.coverageNotes ?? '',
  }));
  const [lines, setLines] = useState<WarrantyLineDraft[]>(() => {
    if (existing?.items.length) return existing.items.map(warrantyLineFromItem);
    if (quotation?.items.length) {
      // Prefill from the quotation; drop product links the warranty catalog doesn't know.
      const known = new Set(products.map((p) => p.id));
      return warrantyLinesFromQuotation(quotation.items).map((l) => (known.has(l.productId) ? l : { ...l, productId: '' }));
    }
    return [newWarrantyLine()];
  });
  const [lineErrors, setLineErrors] = useState<Record<string, LineErr>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Header, string>>>({});
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof Header>(key: K, value: Header[K]) => setHeader((h) => ({ ...h, [key]: value }));
  const setLine = (key: string, patch: Partial<WarrantyLineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const applyProduct = (line: WarrantyLineDraft, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const patch: Partial<WarrantyLineDraft> = { productId };
    if (product && !line.description.trim()) patch.description = product.name;
    setLine(line.key, patch);
    // Mobile: picking a product with a warranty term sets the end date from the start date.
    const end = product ? impliedWarrantyEnd(header.warrantyStartOn, [product.warrantyMonths]) : null;
    if (end) set('warrantyEndOn', end);
  };

  const save = useApiMutation(
    (body: WarrantyInput) =>
      existing
        ? salesApi.updateWarranty(existing.id, { ...body, leadId: undefined, quotationId: undefined, version: existing.version })
        : salesApi.createWarranty(body),
    {
      success: existing ? 'Warranty card updated' : 'Warranty card issued',
      invalidate: [salesKeys.warrantiesAll],
      onSuccess: (w) => navigate(`/warranties/${w.id}`, { replace: true }),
    },
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof Header, string>> = {};
    if (!header.warrantyStartOn) errs.warrantyStartOn = 'Pick the warranty start date.';
    if (header.warrantyEndOn && header.warrantyStartOn && header.warrantyEndOn < header.warrantyStartOn)
      errs.warrantyEndOn = 'End date must be on or after the start date.';
    if (header.serialNumber.trim().length > 80) errs.serialNumber = 'At most 80 characters.';
    if (header.coverageNotes.trim().length > 2000) errs.coverageNotes = 'At most 2000 characters.';
    const result = validateWarrantyLines(lines);
    setFieldErrors(errs);
    setLineErrors(result.errors);
    const msg = Object.keys(errs).length ? 'Fix the highlighted fields.' : result.message;
    setMessage(msg);
    if (msg) return;
    const opt = (v: string) => v.trim() || undefined;
    save.mutate({
      leadId: header.leadId || undefined,
      quotationId: quotationId || undefined,
      serialNumber: existing ? header.serialNumber.trim() : opt(header.serialNumber),
      purchasedOn: header.purchasedOn || undefined,
      warrantyStartOn: header.warrantyStartOn,
      warrantyEndOn: header.warrantyEndOn || undefined,
      coverageNotes: existing ? header.coverageNotes.trim() : opt(header.coverageNotes),
      items: result.items,
    });
  }

  const back = existing ? `/warranties/${existing.id}` : quotationId ? `/quotations/${quotationId}` : '/warranties';

  return (
    <>
      <Link to={back} className="back-link">
        ← Back
      </Link>
      <PageHeader
        title={existing ? `Edit ${existing.cardNumber}` : 'Issue warranty'}
        subtitle={quotation ? `From quotation ${quotation.quotationNumber}` : 'A QR code, PDF and verification URL are generated on save.'}
      />
      <form className="stack" onSubmit={onSubmit} noValidate>
        <section className="card">
          <FormGrid>
            {existing || presetLeadId ? (
              header.leadId ? <LeadSummary leadId={header.leadId} /> : null
            ) : (
              <LeadPicker label="Lead (optional)" value={header.leadId} onChange={(v) => set('leadId', v)} />
            )}
            <TextField label="Serial number" value={header.serialNumber} maxLength={80} error={fieldErrors.serialNumber} onValue={(v) => set('serialNumber', v)} />
            <TextField label="Purchased on" type="date" value={header.purchasedOn} onValue={(v) => set('purchasedOn', v)} hint="Optional" />
            <TextField
              label="Warranty start"
              type="date"
              required
              value={header.warrantyStartOn}
              error={fieldErrors.warrantyStartOn}
              onValue={(v) => set('warrantyStartOn', v)}
            />
            <TextField
              label="Warranty end"
              type="date"
              value={header.warrantyEndOn}
              min={header.warrantyStartOn || undefined}
              error={fieldErrors.warrantyEndOn}
              hint={
                header.warrantyEndOn && header.warrantyStartOn
                  ? warrantyPeriodLabel(header.warrantyStartOn, header.warrantyEndOn)
                  : 'Default from product'
              }
              onValue={(v) => set('warrantyEndOn', v)}
            />
            <div className="span-2">
              <TextArea label="Coverage notes" rows={3} value={header.coverageNotes} maxLength={2000} error={fieldErrors.coverageNotes} onValue={(v) => set('coverageNotes', v)} />
            </div>
          </FormGrid>
        </section>

        <section className="card stack">
          <h2>Covered items</h2>
          {lines.map((line, index) => {
            const err = lineErrors[line.key] ?? {};
            return (
              <div key={line.key} className="sales-line">
                <div className="sales-line-head">
                  <strong>Item {index + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  >
                    Delete item
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
                            {p.warrantyMonths ? ` — ${p.warrantyMonths} months` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="span-2">
                    <TextField label="Description" required value={line.description} maxLength={240} error={err.description} onValue={(v) => setLine(line.key, { description: v })} />
                  </div>
                  <TextField label="Serial number" value={line.serialNumber} maxLength={80} error={err.serialNumber} onValue={(v) => setLine(line.key, { serialNumber: v })} />
                  <TextField label="Quantity" inputMode="numeric" value={line.quantity} error={err.quantity} onValue={(v) => setLine(line.key, { quantity: v.replace(/[^\d]/g, '') })} />
                </FormGrid>
              </div>
            );
          })}
          <div>
            <button type="button" className="btn btn-ghost" disabled={lines.length >= 50} onClick={() => setLines((ls) => [...ls, newWarrantyLine()])}>
              + Add item
            </button>
          </div>
        </section>

        <FormError message={message} />
        <FormActions>
          <Link className="btn btn-ghost" to={back}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save warranty'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
