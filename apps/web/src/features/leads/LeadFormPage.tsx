import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { FormActions, FormError, FormGrid, SelectField, TextArea, TextField } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';
import { leadKeys, leadsApi } from './api';
import { useLeadInvalidation } from './LeadWidgets';
import {
  createLeadBody,
  defaultOwner,
  EMPTY_LEAD_FORM,
  fieldErrorsFrom,
  formFromLead,
  updateLeadBody,
  validateLeadForm,
  type LeadFormState,
} from './logic';
import { FOLLOW_UP_TYPES } from './types';
import './leads.css';

const FALLBACK_QUALITIES = [
  { code: 'hot', name: 'Hot' },
  { code: 'warm', name: 'Warm' },
  { code: 'cold', name: 'Cold' },
];

/** /leads/create and /leads/:leadId/edit (mobile LeadFormPage). */
export function LeadFormPage() {
  const { leadId } = useParams();
  const isEdit = !!leadId;
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const invalidate = useLeadInvalidation();

  const lookups = useQuery({ queryKey: leadKeys.lookups, queryFn: leadsApi.lookups, staleTime: 5 * 60_000 });
  const existing = useQuery({
    queryKey: leadKeys.detail(leadId ?? ''),
    queryFn: () => leadsApi.get(leadId!),
    enabled: isEdit,
  });

  const [form, setForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Seed the form once from the loaded lead (edit) or default owner (create).
  useEffect(() => {
    if (isEdit && existing.data && loadedFor !== existing.data.id) {
      setForm(formFromLead(existing.data));
      setLoadedFor(existing.data.id);
    }
  }, [isEdit, existing.data, loadedFor]);
  useEffect(() => {
    if (!isEdit && lookups.data) {
      setForm((f) => ({ ...f, ownerMembershipId: defaultOwner(lookups.data.staff, f.ownerMembershipId) }));
    }
  }, [isEdit, lookups.data]);

  const set = <K extends keyof LeadFormState>(key: K) => (value: LeadFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateLeadForm(form, isEdit);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      const saved = isEdit
        ? await leadsApi.update(leadId!, updateLeadBody(form, existing.data!.version))
        : await leadsApi.create(createLeadBody(form));
      await invalidate(saved.id);
      toast.success(isEdit ? 'Lead saved' : 'Lead created');
      navigate(`/leads/${saved.id}`, { replace: true });
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setErrors(fields);
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && !can(P.leadUpdate)) return <ErrorState error={new Error('You don’t have permission to edit leads.')} />;
  if (lookups.isLoading || (isEdit && existing.isLoading)) return <Spinner />;
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;

  const lk = lookups.data;
  const qualities = lk?.qualities.length ? lk.qualities : FALLBACK_QUALITIES;
  const back = isEdit ? `/leads/${leadId}` : '/leads';

  return (
    <>
      <Link to={back} className="back-link">
        ← {isEdit ? 'Lead' : 'Leads'}
      </Link>
      <PageHeader title={isEdit ? 'Edit lead' : 'Create lead'} subtitle={isEdit ? existing.data?.leadNumber : undefined} />
      {lookups.isError ? <FormError message={`Couldn’t load sources and staff: ${errorMessage(lookups.error)}`} /> : null}

      <form className="card leads-form" onSubmit={submit} noValidate>
        <h2>Customer information</h2>
        <FormGrid>
          <TextField label="Customer name" value={form.customerName} maxLength={120} error={errors.customerName} onValue={set('customerName')} />
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            value={form.primaryPhone}
            maxLength={20}
            placeholder="+91 98765 43210"
            error={errors.primaryPhone}
            onValue={set('primaryPhone')}
          />
          <TextField label="Email" type="email" value={form.primaryEmail} maxLength={160} error={errors.primaryEmail} onValue={set('primaryEmail')} />
          <TextField label="City" value={form.city} maxLength={80} error={errors.city} onValue={set('city')} />
        </FormGrid>

        <h2>Requirement information</h2>
        <FormGrid>
          <div className="span-2">
            <TextField label="Lead title" required value={form.title} maxLength={160} error={errors.title} onValue={set('title')} />
          </div>
          <div className="span-2">
            <TextArea label="Requirement" value={form.requirement} maxLength={2000} rows={4} error={errors.requirement} onValue={set('requirement')} />
          </div>
          <SelectField
            label="Lead source"
            value={form.sourceId}
            placeholder="No source"
            options={(lk?.sources ?? []).map((s) => ({ value: s.id, label: s.name }))}
            error={errors.sourceId}
            onValue={set('sourceId')}
          />
          <TextField
            label="Estimated value (₹)"
            inputMode="decimal"
            value={form.estimatedValue}
            error={errors.estimatedValueMinor}
            onValue={(v) => set('estimatedValue')(v.replace(/[^0-9.,]/g, ''))}
          />
          <div className="field span-2">
            <span>Lead quality</span>
            <div className="btn-row" role="group" aria-label="Lead quality">
              {qualities.map((q) => (
                <button
                  key={q.code}
                  type="button"
                  className={`chip${form.quality === q.code ? ' chip-active' : ''}`}
                  aria-pressed={form.quality === q.code}
                  onClick={() => set('quality')(form.quality === q.code ? '' : q.code)}
                >
                  {q.name}
                </button>
              ))}
            </div>
            {errors.quality ? <small className="field-error">{errors.quality}</small> : null}
          </div>
        </FormGrid>

        <h2>Assigned staff</h2>
        <FormGrid>
          <SelectField
            label="Assigned staff"
            required={!isEdit}
            value={form.ownerMembershipId}
            placeholder="Select staff"
            options={(lk?.staff ?? []).map((s) => ({ value: s.id, label: s.designation ? `${s.fullName} · ${s.designation}` : s.fullName }))}
            error={errors.ownerMembershipId}
            onValue={set('ownerMembershipId')}
          />
        </FormGrid>

        {!isEdit ? (
          <>
            <h2>Follow-up</h2>
            <FormGrid>
              <div className="field span-2">
                <span>Type</span>
                <div className="btn-row" role="group" aria-label="Follow-up type">
                  {FOLLOW_UP_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`chip${form.followUpType === t.value ? ' chip-active' : ''}`}
                      aria-pressed={form.followUpType === t.value}
                      onClick={() => set('followUpType')(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <TextField
                label="Schedule follow-up"
                type="datetime-local"
                value={form.followUpDueAt}
                error={errors['followUp.dueAt']}
                hint="Optional — leave blank to skip."
                onValue={set('followUpDueAt')}
              />
              <TextArea
                label="Follow-up notes"
                rows={2}
                maxLength={2000}
                value={form.followUpNotes}
                error={errors['followUp.notes']}
                onValue={set('followUpNotes')}
              />
            </FormGrid>
          </>
        ) : null}

        <FormError message={formError} />
        <FormActions>
          <Link className="btn btn-ghost" to={back}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save lead' : 'Create lead'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
