import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormActions, FormError, TextArea, TextField } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { salesApi } from '../sales/api';
import { salesKeys } from '../sales/keys';
import { parseRupees } from '../sales/logic';
import type { QuotationSpec } from '../sales/types';
import { BackLink } from './shared';

const MAX_LOGO_BYTES = 450_000;

/** Company details, GST default, rounding and defaults used by new quotations and the quotation PDF. */
export function QuotationSettingsPage() {
  const query = useQuery({ queryKey: ['quotation-settings'], queryFn: salesApi.quotationSettings });
  const [gst, setGst] = useState('18');
  const [rounding, setRounding] = useState('100');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [bank, setBank] = useState('');
  const [terms, setTerms] = useState('');
  const [specs, setSpecs] = useState<QuotationSpec[]>([]);
  const [logo, setLogo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = query.data;
    if (!d) return;
    setGst(String(d.defaultGstBps / 100));
    setRounding(String(d.roundingStepMinor / 100));
    setCompany(d.companyName);
    setAddress(d.address);
    setBank(d.bankDetails);
    setTerms(d.defaultTerms);
    setSpecs(d.defaultSpecs);
    setLogo(d.logoDataUrl);
  }, [query.data]);

  const save = useApiMutation(salesApi.updateQuotationSettings, {
    success: 'Quotation settings saved',
    invalidate: [['quotation-settings'], salesKeys.quotationCatalog],
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('Logo must be a PNG or JPEG image.');
    if (file.size > MAX_LOGO_BYTES) return setError('Logo must be under 450 KB.');
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      setLogo(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  function onSave() {
    const gstPct = Number(gst);
    const step = parseRupees(rounding);
    if (!Number.isFinite(gstPct) || gstPct < 0 || gstPct > 100) return setError('Default GST must be 0 to 100.');
    if (step === null || step < 0) return setError('Rounding step must be a valid amount (0 turns it off).');
    setError(null);
    save.mutate({
      defaultGstBps: Math.round(gstPct * 100),
      roundingStepMinor: step,
      companyName: company.trim(),
      address: address.trim(),
      bankDetails: bank.trim(),
      defaultTerms: terms.trim(),
      defaultSpecs: specs.filter((s) => s.label.trim()),
      logoDataUrl: logo,
    });
  }

  return (
    <>
      <BackLink to="/settings/general" label="General settings" />
      <PageHeader title="Quotation settings" subtitle="Used for new quotations and on the quotation PDF." />
      <div className="stack">
        <section className="card stack">
          <h2>Pricing</h2>
          <TextField label="Default GST %" type="number" inputMode="decimal" min={0} max={100} step="0.01" value={gst} onValue={setGst} hint="18% unless changed. It can still be changed per quotation." />
          <TextField label="Round unit prices up to (₹)" inputMode="decimal" value={rounding} onValue={setRounding} hint="Purchase price + margin is rounded up to the next multiple, e.g. ₹100. Enter 0 to switch off." />
        </section>

        <section className="card stack">
          <h2>Company on the PDF</h2>
          <div className="field">
            <span>Logo (PNG or JPEG)</span>
            {logo ? <img src={logo} alt="Company logo" style={{ maxHeight: 64, maxWidth: 240, objectFit: 'contain' }} /> : <span className="muted small">No logo uploaded</span>}
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} />
            {logo ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogo('')}>
                Remove logo
              </button>
            ) : null}
          </div>
          <TextField label="Company name" value={company} maxLength={160} onValue={setCompany} />
          <TextArea label="Bank & UPI details (one per line)" rows={4} value={bank} maxLength={500} onValue={setBank} />
          <TextArea label="Footer address / contact" rows={2} value={address} maxLength={500} onValue={setAddress} />
        </section>

        <section className="card stack">
          <h2>Defaults for new quotations</h2>
          <TextArea label="Terms and conditions (one per line)" rows={8} value={terms} maxLength={4000} onValue={setTerms} />
          <h3>Product specification rows</h3>
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
              + Add row
            </button>
          </div>
        </section>

        <FormError message={error} />
        <FormActions>
          <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </FormActions>
      </div>
    </>
  );
}
