import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { FormActions, FormError, FormGrid, SelectField, TextArea, TextField } from '../../components/form';
import { ConfirmModal, Modal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { perfApi, perfKeys } from './api';
import {
  bandFormValues,
  bandFromForm,
  bandFromSlab,
  bandLabel,
  coverageWarnings,
  nextBandStart,
  PAYOUT_KIND_TITLES,
  payoutKindsFor,
  payoutLabel,
  percentToBps,
  planFormValues,
  savePlan,
  sortBands,
  validatePlan,
  type BandDraft,
  type BandFormValues,
  type PlanFormValues,
  type PlanSaveApi,
  type SavedPlanState,
} from './incentiveDraft';
import { isMoneyUnit, kindTitle } from './logic';
import type { IncentivePlan, PayoutKind } from './types';
import './performance.css';

const saveApi: PlanSaveApi = {
  createPlan: perfApi.createPlan,
  updatePlan: perfApi.updatePlan,
  addSlab: perfApi.addSlab,
  updateSlab: perfApi.updateSlab,
  deleteSlab: perfApi.deleteSlab,
};

/** `/incentives/plans/new` and `/incentives/plans/:planId/edit`. */
export function IncentivePlanFormPage() {
  const { planId } = useParams();
  const catalog = useQuery({ queryKey: perfKeys.targetCatalog, queryFn: perfApi.targetCatalog, staleTime: 5 * 60_000 });
  const plan = useQuery({ queryKey: perfKeys.plan(planId ?? ''), queryFn: () => perfApi.plan(planId!), enabled: !!planId });

  const title = planId ? 'Edit incentive plan' : 'New incentive plan';
  const loading = catalog.isLoading || (!!planId && plan.isLoading);
  const failed = catalog.isError ? catalog : planId && plan.isError ? plan : null;

  return (
    <>
      <Link to="/incentives/plans" className="back-link">
        ← Incentive plans
      </Link>
      <PageHeader title={title} />
      {loading ? (
        <Spinner />
      ) : failed ? (
        <ErrorState error={failed.error} onRetry={() => failed.refetch()} />
      ) : catalog.data!.metrics.length === 0 ? (
        <EmptyState>No target metrics are available to pay on.</EmptyState>
      ) : (
        <PlanForm key={planId ?? 'new'} plan={planId ? plan.data! : null} metrics={catalog.data!.metrics} />
      )}
    </>
  );
}

function PlanForm({ plan, metrics }: { plan: IncentivePlan | null; metrics: Array<{ code: string; name: string; unit: string }> }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const defaultMetric = metrics.some((m) => m.code === 'revenue') ? 'revenue' : (metrics[0]?.code ?? '');
  const [values, setValues] = useState<PlanFormValues>(() => planFormValues(plan, defaultMetric));
  const [saved, setSaved] = useState<SavedPlanState>(() => ({
    planId: plan?.id ?? null,
    version: plan?.version ?? 1,
    savedStatus: plan?.status ?? 'draft',
    savedSlabIds: plan?.slabs.map((s) => s.id) ?? [],
    bands: plan?.slabs.map((s, i) => bandFromSlab(s, i)) ?? [],
  }));
  const [nextKey, setNextKey] = useState(plan?.slabs.length ?? 0);
  const [editing, setEditing] = useState<{ band: BandDraft | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = plan !== null;
  const bands = saved.bands;
  const metric = metrics.find((m) => m.code === values.metricCode);
  const isMoney = metric ? isMoneyUnit(metric.unit) : plan ? plan.basis === 'revenue' : true;
  const minBps = percentToBps(values.minPercent) ?? 0;
  const warnings = coverageWarnings(bands, minBps);
  const statuses: PlanFormValues['status'][] = isEdit && saved.savedStatus !== 'draft' ? ['draft', 'active', 'archived'] : ['draft', 'active'];
  const set = <K extends keyof PlanFormValues>(k: K, v: PlanFormValues[K]) => setValues((cur) => ({ ...cur, [k]: v }));
  const setBands = (next: BandDraft[]) => setSaved((s) => ({ ...s, bands: next }));

  const changeMetric = (code: string) => {
    if (code === values.metricCode) return;
    const next = metrics.find((m) => m.code === code);
    // Percent bands only make sense on money, so switching kinds clears the ladder.
    if (next && isMoneyUnit(next.unit) !== isMoney && bands.length > 0) {
      setBands([]);
      toast.info('Bands cleared — this metric pays a different way.');
    }
    set('metricCode', code);
  };

  const remove = useApiMutation(() => perfApi.deletePlan(saved.planId!), {
    success: 'Plan deleted.',
    invalidate: [perfKeys.incentives, ['reports']],
    onSuccess: () => navigate('/incentives/plans', { replace: true }),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validatePlan(values, bands, isMoney);
    if ('error' in v) {
      setError(v.error);
      return;
    }
    setError(null);
    setSaving(true);
    const result = await savePlan(saveApi, v.fields, saved, errorMessage);
    setSaved(result.state);
    setSaving(false);
    await qc.invalidateQueries({ queryKey: perfKeys.incentives });
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(isEdit ? 'Plan saved.' : 'Plan created.');
    navigate('/incentives/plans');
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <section className="card">
        <h2 className="perf-section-title">Plan</h2>
        <FormGrid>
          <div className="span-2">
            <TextField label="Plan name" required value={values.name} onValue={(v) => set('name', v)} />
          </div>
          <div className="span-2">
            <TextArea label="Description (optional)" rows={2} value={values.description} onValue={(v) => set('description', v)} />
          </div>
          {isEdit ? (
            <div className="span-2">
              <p className="muted small" style={{ margin: 0 }}>
                🔒 Metric (fixed once created): {plan.metricName || plan.metricCode} · {kindTitle(plan.periodType)} · from {values.effectiveFrom}
              </p>
            </div>
          ) : (
            <>
              <SelectField
                label="Pays on (target metric)"
                value={values.metricCode}
                options={metrics.map((m) => ({ value: m.code, label: m.name }))}
                onValue={changeMetric}
                hint="Reps need a target on this metric for the period, or they earn nothing."
              />
              <div className="field">
                <span>Period</span>
                <div className="perf-segment" role="group" aria-label="Period">
                  {['monthly', 'quarterly', 'yearly'].map((p) => (
                    <button key={p} type="button" aria-pressed={values.periodType === p} onClick={() => set('periodType', p)}>
                      {kindTitle(p)}
                    </button>
                  ))}
                </div>
              </div>
              <TextField label="Starts" type="date" required value={values.effectiveFrom} onValue={(v) => set('effectiveFrom', v)} />
            </>
          )}
          <TextField
            label="Ends"
            type="date"
            value={values.effectiveTo}
            min={values.effectiveFrom}
            onValue={(v) => {
              // Clearing an end date on an existing plan is not supported by the API.
              if (v || !isEdit) set('effectiveTo', v);
            }}
            hint={values.effectiveTo ? undefined : 'No end date'}
          />
        </FormGrid>
      </section>

      <section className="card">
        <h2 className="perf-section-title">Rules</h2>
        <FormGrid>
          <TextField
            label="Minimum attainment %"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={values.minPercent}
            onValue={(v) => set('minPercent', v)}
          />
          <TextField
            label="Hold back %"
            type="number"
            min={0}
            max={100}
            step="any"
            inputMode="decimal"
            value={values.holdPercent}
            onValue={(v) => set('holdPercent', v)}
          />
          <TextField
            label="Payout cap ₹ (optional)"
            inputMode="decimal"
            value={values.cap}
            onValue={(v) => set('cap', v)}
            hint="Nothing is paid below the minimum. The hold-back is kept from each payout until released."
          />
        </FormGrid>
      </section>

      <section className="card">
        <div className="list-row">
          <h2 className="perf-section-title">Bands</h2>
          <span className="muted small">by % of target</span>
        </div>
        {sortBands(bands).map((band) => (
          <div key={band.key} className="perf-band">
            <button type="button" className="perf-band-main" onClick={() => setEditing({ band })}>
              <strong>{bandLabel(band)}</strong>
              <div className="small">{[band.label?.trim(), payoutLabel(band)].filter(Boolean).join(' · ')}</div>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove band ${bandLabel(band)}`}
              onClick={() => setBands(bands.filter((b) => b.key !== band.key))}
            >
              ×
            </button>
          </div>
        ))}
        {warnings.map((w) => (
          <div key={w} className="perf-warning">
            ⚠ <span>{w}</span>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing({ band: null })}>
            + Add band
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="perf-section-title">Status</h2>
        <div className="perf-segment" role="group" aria-label="Status">
          {statuses.map((s) => (
            <button key={s} type="button" aria-pressed={values.status === s} onClick={() => set('status', s)}>
              {s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'Draft'}
            </button>
          ))}
        </div>
        <p className="muted small">
          {values.status === 'active'
            ? 'Active plans are used when payouts are computed.'
            : values.status === 'archived'
              ? 'Archived plans stay on record but are no longer used.'
              : 'Drafts can be computed to preview payouts before going live.'}
        </p>
      </section>

      <FormError message={error} />
      <FormActions>
        {isEdit ? (
          <button type="button" className="btn btn-danger" disabled={saving || remove.isPending} onClick={() => setConfirmDelete(true)}>
            Delete plan
          </button>
        ) : null}
        <Link className="btn btn-ghost" to="/incentives/plans">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
        </button>
      </FormActions>

      {editing ? (
        <BandModal
          initial={editing.band}
          keyForNew={nextKey}
          startBps={editing.band?.fromBps ?? nextBandStart(bands, minBps)}
          kinds={payoutKindsFor(isMoney)}
          others={bands}
          onClose={() => setEditing(null)}
          onDone={(band) => {
            if (editing.band) setBands(bands.map((b) => (b.key === editing.band!.key ? band : b)));
            else {
              setBands([...bands, band]);
              setNextKey((k) => k + 1);
            }
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmModal
        open={confirmDelete}
        title="Delete this plan?"
        message="The plan, its bands and any draft payouts are removed. A plan that has already approved or paid someone cannot be deleted — archive it instead."
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
        onClose={() => setConfirmDelete(false)}
      />
    </form>
  );
}

/** Adds or edits one band; refuses invalid or overlapping ranges before the form holds them. */
function BandModal({
  initial,
  keyForNew,
  startBps,
  kinds,
  others,
  onClose,
  onDone,
}: {
  initial: BandDraft | null;
  keyForNew: number;
  startBps: number;
  kinds: PayoutKind[];
  others: BandDraft[];
  onClose: () => void;
  onDone: (band: BandDraft) => void;
}) {
  const [v, setV] = useState<BandFormValues>(() => bandFormValues(initial, startBps, kinds));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [v]);
  const set = <K extends keyof BandFormValues>(k: K, value: BandFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const valueLabel = v.kind === 'percent' ? 'Pay % of sales' : v.kind === 'flat' ? 'Pay amount ₹' : 'Pay ₹ per unit';

  const done = () => {
    const result = bandFromForm(v, { initial, keyForNew, others });
    if ('error' in result) setError(result.error);
    else onDone(result.band);
  };

  return (
    <Modal
      open
      title={initial ? 'Edit band' : 'Add band'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={done}>
            {initial ? 'Update band' : 'Add band'}
          </button>
        </>
      }
    >
      <FormGrid>
        <TextField label="From % of target" inputMode="decimal" value={v.from} onValue={(x) => set('from', x)} />
        <TextField label="Up to % (optional)" inputMode="decimal" value={v.to} onValue={(x) => set('to', x)} />
        <p className="muted small span-2" style={{ margin: 0 }}>
          Leave "Up to" empty for the top band, so everyone above it is paid.
        </p>
        <div className="span-2">
          <div className="perf-segment" role="group" aria-label="Payout kind">
            {kinds.map((k) => (
              <button key={k} type="button" aria-pressed={v.kind === k} onClick={() => setV((cur) => ({ ...cur, kind: k, value: '' }))}>
                {PAYOUT_KIND_TITLES[k]}
              </button>
            ))}
          </div>
        </div>
        <TextField label={valueLabel} inputMode="decimal" value={v.value} onValue={(x) => set('value', x)} />
        <TextField label="Bonus ₹ for reaching this band (optional)" inputMode="decimal" value={v.bonus} onValue={(x) => set('bonus', x)} />
        <div className="span-2">
          <TextField label='Label (optional, e.g. "Star")' value={v.label} onValue={(x) => set('label', x)} />
        </div>
      </FormGrid>
      <FormError message={error} />
    </Modal>
  );
}
