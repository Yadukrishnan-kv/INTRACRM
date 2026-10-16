import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage, fieldErrors } from '../../api/client';
import { FormActions, FormError, FormGrid, SelectField, TextArea, TextField, toLocalInput } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation, useDebounced } from '../../lib/hooks';
import { followUpsApi, keys, lookupApi } from './api';
import { AssigneeField } from './components';
import { PRIORITY_LABELS, typeTitle, validateFollowUpForm, type FollowUpFormValues } from './logic';
import { FOLLOW_UP_TYPES, type CreateFollowUpBody, type FollowUp, type FollowUpType, type UpdateFollowUpBody } from './types';
import './followups.css';

function tomorrowLocal(): string {
  return toLocalInput(new Date(Date.now() + 24 * 3_600_000).toISOString());
}

export function FollowUpFormPage() {
  const { followUpId } = useParams();
  if (followUpId) return <EditLoader id={followUpId} />;
  return <FollowUpForm />;
}

function EditLoader({ id }: { id: string }) {
  const query = useQuery({ queryKey: keys.detail(id), queryFn: () => followUpsApi.get(id) });
  if (query.isLoading) return <Spinner />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <FollowUpForm existing={query.data} />;
}

function FollowUpForm({ existing }: { existing?: FollowUp }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefillLead = params.get('leadId');
  const mode = existing ? 'edit' : 'create';

  const [values, setValues] = useState<FollowUpFormValues>(() => ({
    leadId: existing?.leadId ?? prefillLead ?? '',
    type: existing?.type ?? 'call',
    title: existing?.title ?? '',
    dueAt: existing ? toLocalInput(existing.dueAt) : tomorrowLocal(),
    remindAt: '',
    priority: existing ? String(existing.priority) : '',
    notes: existing?.notes ?? '',
  }));
  const [assignee, setAssignee] = useState(existing?.assignedToMembershipId ?? '');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const set = (key: keyof FollowUpFormValues) => (v: string) => setValues((s) => ({ ...s, [key]: v }));

  const mutation = useApiMutation(
    async (): Promise<FollowUp> => {
      const title = values.title.trim();
      const notes = values.notes.trim();
      const priority = values.priority ? Number(values.priority) : undefined;
      if (existing) {
        const body: UpdateFollowUpBody = {
          type: values.type as FollowUpType,
          title: title || undefined,
          notes,
          priority,
          assignedToMembershipId: assignee && assignee !== existing.assignedToMembershipId ? assignee : undefined,
          version: existing.version,
        };
        return followUpsApi.update(existing.id, body);
      }
      const due = new Date(values.dueAt).toISOString();
      const body: CreateFollowUpBody = {
        leadId: values.leadId,
        type: values.type as FollowUpType,
        dueAt: due,
        remindAt: values.remindAt ? new Date(values.remindAt).toISOString() : undefined,
        title: title || undefined,
        notes: notes || undefined,
        priority,
        assignedToMembershipId: assignee || undefined,
      };
      return followUpsApi.create(body);
    },
    {
      success: existing ? 'Follow-up updated' : 'Follow-up scheduled',
      invalidate: [keys.all, ['leads']],
      onSuccess: (saved) => navigate(`/tasks/${saved.id}`, { replace: true }),
    },
  );

  const serverErrors = fieldErrors(mutation.error);
  const errors = { ...serverErrors, ...localErrors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateFollowUpForm(values, mode);
    setLocalErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(undefined);
  };

  const backTo = existing ? `/tasks/${existing.id}` : prefillLead ? `/leads/${prefillLead}` : '/tasks';

  return (
    <>
      <Link className="back-link" to={backTo}>
        ← Back
      </Link>
      <PageHeader title={existing ? 'Edit follow-up' : 'Schedule follow-up'} />
      <form className="card" onSubmit={submit} noValidate>
        <FormGrid>
          <div className="field span-2">
            <span>Type</span>
            <div className="btn-row followups-type-chips" role="radiogroup" aria-label="Follow-up type">
              {FOLLOW_UP_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={values.type === t}
                  className={`chip${values.type === t ? ' chip-active' : ''}`}
                  onClick={() => set('type')(t)}
                >
                  {typeTitle(t)}
                </button>
              ))}
            </div>
            {errors.type ? <small className="field-error">{errors.type}</small> : null}
          </div>

          {existing ? (
            <div className="field span-2">
              <span>Lead</span>
              <div className="followups-field-value">
                <Link to={`/leads/${existing.leadId}`}>{existing.leadTitle ?? existing.leadNumber ?? 'Lead'}</Link>
                {existing.leadNumber ? <span className="muted small"> · {existing.leadNumber}</span> : null}
              </div>
            </div>
          ) : (
            <LeadPicker value={values.leadId} onValue={set('leadId')} locked={!!prefillLead} error={errors.leadId} />
          )}

          <div className="span-2">
          <TextField
            label="Title"
            value={values.title}
            onValue={set('title')}
            error={errors.title}
            maxLength={160}
            placeholder={`Defaults to “${typeTitle(values.type)}”`}
          />
          </div>

          {existing ? (
            <div className="field">
              <span>Due</span>
              <div className="muted followups-field-value">Use Reschedule on the follow-up to change the due time.</div>
            </div>
          ) : (
            <>
              <TextField label="Due date & time" type="datetime-local" required value={values.dueAt} onValue={set('dueAt')} error={errors.dueAt} />
              <TextField label="Remind at" type="datetime-local" value={values.remindAt} onValue={set('remindAt')} error={errors.remindAt} hint="Optional" />
            </>
          )}

          <SelectField
            label="Priority"
            value={values.priority}
            onValue={set('priority')}
            error={errors.priority}
            placeholder="Default"
            options={[1, 2, 3].map((p) => ({ value: String(p), label: PRIORITY_LABELS[p] ?? String(p) }))}
          />
          <AssigneeField value={assignee} onValue={setAssignee} error={errors.assignedToMembershipId} />

          <div className="span-2">
            <TextArea label="Notes" rows={3} value={values.notes} onValue={set('notes')} error={errors.notes} maxLength={2000} />
          </div>
        </FormGrid>
        <FormError message={mutation.isError && Object.keys(serverErrors).length === 0 ? errorMessage(mutation.error) : null} />
        <FormActions>
          <Link className="btn btn-ghost" to={backTo}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Schedule follow-up'}
          </button>
        </FormActions>
      </form>
    </>
  );
}

/** Searchable open-lead picker (mobile shows a dropdown of leads when no lead is pre-selected). */
function LeadPicker({ value, onValue, locked, error }: { value: string; onValue: (v: string) => void; locked: boolean; error?: string }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const selected = useQuery({ queryKey: ['follow-ups', 'lead-option', value], queryFn: () => lookupApi.lead(value), enabled: !!value });
  const options = useQuery({ queryKey: ['follow-ups', 'lead-options', debounced], queryFn: () => lookupApi.leads(debounced), enabled: !locked });

  const label = selected.data ? `${selected.data.leadNumber} · ${selected.data.customerName ?? selected.data.title}` : value ? 'Loading lead…' : '';

  if (locked) {
    return (
      <div className="field span-2">
        <span>Lead</span>
        <div className="followups-field-value">{selected.isError ? <span className="field-error">Couldn’t load the lead.</span> : label}</div>
      </div>
    );
  }

  const opts = [...(options.data ?? [])];
  if (selected.data && !opts.some((o) => o.id === selected.data.id)) opts.unshift(selected.data);

  return (
    <>
      <TextField label="Find lead" type="search" value={q} onValue={setQ} placeholder="Search name, number or phone" />
      <SelectField
        label="Lead"
        required
        value={value}
        onValue={onValue}
        error={error}
        placeholder={options.isLoading ? 'Loading…' : 'Select a lead'}
        options={opts.map((l) => ({ value: l.id, label: `${l.leadNumber} · ${l.customerName ?? l.title}` }))}
        hint={options.isError ? 'Couldn’t load leads.' : undefined}
      />
    </>
  );
}
