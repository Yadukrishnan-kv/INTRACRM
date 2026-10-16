import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, fieldErrors } from '../../api/client';
import {
  FormActions,
  FormError,
  FormGrid,
  SelectField,
  TextArea,
  TextField,
  fromLocalInput,
  toLocalInput,
} from '../../components/form';
import { ErrorState, PageHeader } from '../../components/ui';
import { useApiMutation, useDebounced } from '../../lib/hooks';
import { fieldApi } from './api';
import { locate } from './location';
import './field.css';
import { geoLabel, toCreateVisitBody, validateVisitDraft, type VisitDraft } from './logic';

function defaultWhen(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function SiteVisitFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetLeadId = params.get('leadId') ?? '';

  const [draft, setDraft] = useState<VisitDraft>({
    leadId: presetLeadId,
    scheduledAt: defaultWhen(),
    purpose: '',
    notes: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    assignedToMembershipId: '',
    location: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leadSearch, setLeadSearch] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const search = useDebounced(leadSearch);
  const set = <K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const presetLead = useQuery({
    queryKey: ['lead-option', presetLeadId],
    queryFn: () => fieldApi.lead(presetLeadId),
    enabled: !!presetLeadId,
  });
  const leadOptions = useQuery({
    queryKey: ['lead-options', search],
    queryFn: () => fieldApi.leadOptions(search),
    enabled: !presetLeadId,
  });
  const lookups = useQuery({ queryKey: ['lead-lookups'], queryFn: fieldApi.lookups, staleTime: 5 * 60_000 });

  // Prefill the city from the chosen lead, as a convenience.
  useEffect(() => {
    const lead = presetLead.data ?? leadOptions.data?.find((l) => l.id === draft.leadId);
    if (lead?.city) setDraft((d) => (d.city ? d : { ...d, city: lead.city ?? '' }));
  }, [presetLead.data, leadOptions.data, draft.leadId]);

  const create = useApiMutation(fieldApi.createVisit, {
    success: 'Site visit scheduled',
    invalidate: [['site-visits']],
    onSuccess: (visit) => navigate(`/visits/${visit.id}`, { replace: true }),
  });

  const captureGps = async () => {
    setGeoBusy(true);
    const result = await locate();
    setGeoBusy(false);
    if (result.ok) {
      set('location', result.point);
      setGeoError(null);
    } else {
      setGeoError(result.message);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local = validateVisitDraft(draft);
    setErrors(local);
    if (Object.keys(local).length) return;
    create.mutate(toCreateVisitBody(draft));
  };

  const serverErrors = fieldErrors(create.error);
  const err = (k: string) => errors[k] ?? serverErrors[k];
  const leadChoices = leadOptions.data ?? [];

  return (
    <>
      <Link to="/visits" className="back-link">
        ← Site visits
      </Link>
      <PageHeader title="Schedule visit" />
      <form className="card" onSubmit={submit} noValidate>
        <FormGrid>
          {presetLeadId ? (
            <div className="field span-2">
              <span>Lead</span>
              {presetLead.isLoading ? (
                <span className="muted">Loading lead…</span>
              ) : presetLead.isError ? (
                <ErrorState error={presetLead.error} onRetry={() => presetLead.refetch()} />
              ) : (
                <strong>
                  {presetLead.data?.leadNumber} {presetLead.data?.title}
                  {presetLead.data?.customerName ? <span className="muted"> · {presetLead.data.customerName}</span> : null}
                </strong>
              )}
            </div>
          ) : (
            <>
              <TextField
                label="Find lead"
                type="search"
                value={leadSearch}
                onValue={setLeadSearch}
                placeholder="Name, number or phone"
              />
              <SelectField
                label="Lead"
                required
                value={draft.leadId}
                onValue={(v) => set('leadId', v)}
                placeholder={leadOptions.isLoading ? 'Loading…' : 'Select a lead'}
                options={leadChoices.map((l) => ({
                  value: l.id,
                  label: `${l.leadNumber} ${l.title}${l.customerName ? ` · ${l.customerName}` : ''}`,
                }))}
                error={err('leadId') ?? (leadOptions.isError ? 'Could not load leads.' : undefined)}
              />
            </>
          )}
          <TextField
            label="Purpose"
            value={draft.purpose}
            onValue={(v) => set('purpose', v)}
            maxLength={160}
            error={err('purpose')}
            placeholder="e.g. Measure openings"
          />
          <TextField
            label="Scheduled at"
            type="datetime-local"
            required
            value={toLocalInput(draft.scheduledAt)}
            onValue={(v) => set('scheduledAt', fromLocalInput(v) ?? '')}
            error={err('scheduledAt')}
          />
          <div className="span-2">
            <TextField
              label="Address"
              value={draft.addressLine1}
              onValue={(v) => set('addressLine1', v)}
              maxLength={160}
              error={err('addressLine1')}
            />
          </div>
          <TextField label="City" value={draft.city} onValue={(v) => set('city', v)} maxLength={80} error={err('city')} />
          <TextField label="State" value={draft.state} onValue={(v) => set('state', v)} maxLength={80} error={err('state')} />
          <TextField
            label="Postal code"
            value={draft.postalCode}
            onValue={(v) => set('postalCode', v)}
            maxLength={20}
            error={err('postalCode')}
          />
          <SelectField
            label="Assign to"
            value={draft.assignedToMembershipId}
            onValue={(v) => set('assignedToMembershipId', v)}
            placeholder="Lead owner (default)"
            options={(lookups.data?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
            error={err('assignedToMembershipId')}
          />
          <div className="span-2">
            <TextArea
              label="Notes"
              value={draft.notes}
              onValue={(v) => set('notes', v)}
              maxLength={2000}
              rows={3}
              error={err('notes')}
            />
          </div>
          <div className="field span-2">
            <span>Planned GPS location</span>
            <div className="btn-row">
              <span className="muted">{draft.location ? geoLabel(draft.location) : 'Optional planned location'}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={captureGps} disabled={geoBusy}>
                {geoBusy ? 'Locating…' : 'Capture current location'}
              </button>
              {draft.location ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('location', null)}>
                  Clear
                </button>
              ) : null}
            </div>
            {geoError ? <small className="field-error">{geoError}</small> : null}
          </div>
        </FormGrid>
        <FormError message={create.isError && !Object.keys(serverErrors).length ? errorMessage(create.error) : null} />
        <FormActions>
          <Link to="/visits" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Scheduling…' : 'Schedule visit'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
