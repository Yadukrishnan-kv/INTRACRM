import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { CheckboxField, FormActions, FormError, TextField } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys } from './api';
import { buildTaxBatch, taxRowsFromItems, type TaxRow } from './logic';
import { BackLink } from './shared';

let rowSeq = 0;
const newRow = (name = '', rate = '0'): TaxRow => ({ key: `new-${++rowSeq}`, name, rate, active: true });

/** Bulk tax editor (mobile TaxesSettingsPage): edit every row, then save all at once. */
export function TaxesPage() {
  const query = useQuery({ queryKey: [...adminKeys.catalog, 'taxes'], queryFn: () => adminApi.catalogList('taxes') });
  const [rows, setRows] = useState<TaxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) setRows(query.data.length ? taxRowsFromItems(query.data) : [newRow('GST 18%', '18')]);
  }, [query.data]);

  const save = useApiMutation(
    (vars: { items: Parameters<typeof adminApi.saveTaxes>[0]; deleteIds: string[] }) =>
      adminApi.saveTaxes(vars.items, vars.deleteIds),
    { success: 'Taxes saved', invalidate: [adminKeys.catalog] },
  );

  if (query.isLoading || (query.data && !rows)) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const list = rows ?? [];

  function update(key: string, patch: Partial<TaxRow>) {
    setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onSave() {
    const result = buildTaxBatch(list, query.data ?? []);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    save.mutate({ items: result.items, deleteIds: result.deleteIds });
  }

  return (
    <>
      <BackLink to="/settings/general" label="General settings" />
      <PageHeader
        title="Taxes"
        subtitle="Manage multiple taxes. Rows without a name are ignored; removed rows are deleted when you save."
      />
      <div className="card">
        {list.map((row) => (
          <div key={row.key} className="admin-tax-row">
            <TextField label="Name" value={row.name} onValue={(v) => update(row.key, { name: v })} maxLength={120} />
            <TextField
              label="Tax %"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={row.rate}
              onValue={(v) => update(row.key, { rate: v })}
            />
            <CheckboxField label="Active" checked={row.active} onValue={(v) => update(row.key, { active: v })} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={list.length === 1}
              onClick={() => setRows((rs) => (rs ?? []).filter((r) => r.key !== row.key))}
            >
              Delete
            </button>
          </div>
        ))}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...(rs ?? []), newRow()])}>
            + Add tax
          </button>
        </div>
        <FormError message={error ?? (save.error ? errorMessage(save.error) : null)} />
        <FormActions>
          <button type="button" className="btn btn-ghost" disabled={save.isPending} onClick={() => query.data && setRows(taxRowsFromItems(query.data))}>
            Reset
          </button>
          <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save all taxes'}
          </button>
        </FormActions>
      </div>
    </>
  );
}
