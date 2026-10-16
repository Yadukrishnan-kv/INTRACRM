import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { FormActions, FormError, FormGrid, SelectField, TextArea, TextField } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { perfApi, perfKeys } from './api';
import { buildTargetBody, isMoneyUnit, kindTitle, TARGET_KINDS, todayYmd, type TargetFormValues } from './logic';
import type { Target } from './types';
import './performance.css';

/** `/targets/create` — mobile TargetFormPage. */
export function TargetFormPage() {
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: perfKeys.targetCatalog, queryFn: perfApi.targetCatalog, staleTime: 5 * 60_000 });
  const [values, setValues] = useState<TargetFormValues>({
    kind: 'monthly',
    scopeType: 'tenant',
    metricCode: '',
    value: '',
    anchor: todayYmd(),
    teamId: '',
    staffId: '',
    productId: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation((body: Record<string, unknown>) => perfApi.createTarget(body), {
    success: 'Target saved.',
    invalidate: [perfKeys.targets, ['dashboard']],
    onSuccess: (t: Target) => navigate(`/targets/${t.id}`, { replace: true }),
  });

  if (catalog.isLoading) return <Spinner />;
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;
  const cat = catalog.data!;
  const metricCode = values.metricCode || cat.metrics[0]?.code || '';
  const metric = cat.metrics.find((m) => m.code === metricCode);
  const set = <K extends keyof TargetFormValues>(key: K, value: TargetFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const chooseKind = (kind: TargetFormValues['kind']) =>
    setValues((v) => ({
      ...v,
      kind,
      scopeType: kind === 'team' ? 'team' : v.scopeType,
      // Product targets usually count units.
      metricCode: kind === 'product' && cat.metrics.some((m) => m.code === 'units_sold') ? 'units_sold' : v.metricCode,
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = buildTargetBody({ ...values, metricCode }, metric);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    create.mutate(result.body);
  };

  const showTeam = values.kind === 'team' || values.scopeType === 'team';
  const showStaff = values.scopeType === 'membership' && values.kind !== 'team';

  return (
    <>
      <Link to="/targets" className="back-link">
        ← Targets
      </Link>
      <PageHeader title="Create target" />
      <form className="card" onSubmit={submit} noValidate>
        <div className="perf-segment" role="group" aria-label="Target kind" style={{ marginBottom: 16 }}>
          {TARGET_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={values.kind === k} onClick={() => chooseKind(k)}>
              {kindTitle(k)}
            </button>
          ))}
        </div>
        <FormGrid>
          <SelectField
            label="Metric"
            required
            value={metricCode}
            options={cat.metrics.map((m) => ({ value: m.code, label: m.name }))}
            onValue={(v) => set('metricCode', v)}
            hint={metric?.description ?? undefined}
          />
          <TextField
            label={isMoneyUnit(metric?.unit) ? 'Target value (₹)' : 'Target value'}
            required
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={values.value}
            onValue={(v) => set('value', v)}
          />
          <TextField
            label={values.kind === 'daily' ? 'Day' : 'Month'}
            type="date"
            value={values.anchor}
            onValue={(v) => set('anchor', v || todayYmd())}
            hint={values.kind === 'daily' ? undefined : 'Any day in the target month.'}
          />
          {values.kind !== 'team' ? (
            <SelectField
              label="Scope"
              value={values.scopeType}
              options={[
                { value: 'tenant', label: 'Company' },
                { value: 'team', label: 'Team' },
                { value: 'membership', label: 'Staff' },
              ]}
              onValue={(v) => set('scopeType', v as TargetFormValues['scopeType'])}
            />
          ) : null}
          {showTeam ? (
            <SelectField
              label="Team"
              required
              value={values.teamId}
              placeholder="Select a team"
              options={cat.teams.map((t) => ({ value: t.id, label: t.name }))}
              onValue={(v) => set('teamId', v)}
            />
          ) : null}
          {showStaff ? (
            <SelectField
              label="Staff"
              required
              value={values.staffId}
              placeholder="Select a staff member"
              options={cat.staff.map((s) => ({ value: s.membershipId, label: s.name }))}
              onValue={(v) => set('staffId', v)}
            />
          ) : null}
          <SelectField
            label={values.kind === 'product' ? 'Product' : 'Product (optional)'}
            required={values.kind === 'product'}
            value={values.productId}
            placeholder="None"
            options={cat.products.map((p) => ({ value: p.id, label: p.sku ? `${p.name} (${p.sku})` : p.name }))}
            onValue={(v) => set('productId', v)}
          />
          <div className="span-2">
            <TextArea label="Notes" rows={3} value={values.notes} onValue={(v) => set('notes', v)} />
          </div>
        </FormGrid>
        <FormError message={error ?? (create.error ? errorMessage(create.error) : null)} />
        <FormActions>
          <Link className="btn btn-ghost" to="/targets">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save target'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
