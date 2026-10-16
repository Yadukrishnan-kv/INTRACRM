import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fieldErrors } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { SelectField, TextArea, TextField, FormError, fromLocalInput, toLocalInput } from '../../components/form';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { Badge } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { errorMessage } from '../../api/client';
import { followUpsApi, keys, lookupApi } from './api';
import type { FollowUp, StaffOption } from './types';

/** Staff picker data. Only managers (tenant:manage_users) can list staff — same gate as mobile's owner picker. */
export function useStaffOptions(): { canPick: boolean; staff: StaffOption[]; loading: boolean } {
  const { can } = useAuth();
  const canPick = can(P.tenantManageUsers);
  const query = useQuery({ queryKey: keys.staff, queryFn: lookupApi.staff, enabled: canPick, staleTime: 5 * 60_000 });
  return { canPick, staff: query.data ?? [], loading: query.isLoading && canPick };
}

export function FollowUpStatusBadge({ item }: { item: Pick<FollowUp, 'status' | 'overdue'> }) {
  if (item.overdue) return <Badge value="overdue" tone="danger" />;
  if (item.status === 'pending') return <Badge value="pending" tone="info" />;
  return <Badge value={item.status} />;
}

/** Mobile's reschedule flow: pick date+time, then an optional reason. */
export function RescheduleModal({ item, open, onClose }: { item: FollowUp; open: boolean; onClose: () => void }) {
  const [dueAt, setDueAt] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const due = new Date(item.dueAt);
      const start = due.getTime() < Date.now() ? new Date(Date.now() + 60 * 60_000) : due;
      setDueAt(toLocalInput(start.toISOString()));
      setReason('');
      setLocalError(null);
    }
  }, [open, item.dueAt]);

  const mutation = useApiMutation(
    () => followUpsApi.reschedule(item.id, { dueAt: fromLocalInput(dueAt) ?? '', reason: reason.trim() || undefined, version: item.version }),
    { success: 'Follow-up rescheduled', invalidate: [keys.all, ['leads']], onSuccess: onClose },
  );
  const errs = fieldErrors(mutation.error);

  const submit = () => {
    const iso = fromLocalInput(dueAt);
    if (!iso) return setLocalError('Pick a new due date and time.');
    if (new Date(iso).getTime() < Date.now() - 60_000) return setLocalError('The new due time can’t be in the past.');
    if (reason.length > 2000) return setLocalError('Reason must be at most 2000 characters.');
    setLocalError(null);
    mutation.mutate(undefined);
  };

  return (
    <Modal
      open={open}
      title="Reschedule follow-up"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <TextField label="New due date & time" type="datetime-local" required value={dueAt} onValue={setDueAt} error={errs.dueAt} />
        <TextArea label="Reason" rows={2} value={reason} onValue={setReason} error={errs.reason} maxLength={2000} />
        <FormError message={localError} />
      </div>
    </Modal>
  );
}

/** Mobile's complete flow: optional outcome notes, then complete. */
export function CompleteModal({ item, open, onClose }: { item: FollowUp; open: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const mutation = useApiMutation(
    () => followUpsApi.complete(item.id, { notes: notes.trim() || undefined, version: item.version }),
    { success: 'Follow-up completed', invalidate: [keys.all, ['leads']], onSuccess: onClose },
  );
  const errs = fieldErrors(mutation.error);

  return (
    <Modal
      open={open}
      title="Complete follow-up"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending || notes.length > 2000}>
            {mutation.isPending ? 'Saving…' : 'Complete'}
          </button>
        </>
      }
    >
      <TextArea label="Outcome notes" rows={3} value={notes} onValue={setNotes} error={errs.notes} maxLength={2000} hint="What happened on this follow-up?" />
    </Modal>
  );
}

/** Logs a call through the comms API then opens the returned tel: URI (mobile's calendar call button). */
export function CallButton({ leadId, phone, small = true }: { leadId: string; phone: string | null; small?: boolean }) {
  const cls = `btn btn-ghost${small ? ' btn-sm' : ''}`;
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!phone) return null;
  if (!can(P.activityCreate)) {
    return (
      <a className={cls} href={`tel:${phone}`} onClick={(e) => e.stopPropagation()}>
        Call
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const result = await lookupApi.call(leadId);
          if (result.launchUri && result.mode !== 'sent') window.location.href = result.launchUri;
          else if (!result.launchUri) window.location.href = `tel:${phone}`;
          toast.success(result.warning ?? 'Call logged — connecting…');
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Calling…' : 'Call'}
    </button>
  );
}

export function AssigneeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { canPick, staff } = useStaffOptions();
  if (!canPick) return null;
  return (
    <select className="input" value={value} aria-label="Filter by assignee" onChange={(e) => onChange(e.target.value)}>
      <option value="">All users</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.user.fullName}
          {s.designation ? ` · ${s.designation}` : ''}
        </option>
      ))}
    </select>
  );
}

export function AssigneeField({ value, onValue, error }: { value: string; onValue: (v: string) => void; error?: string }) {
  const { canPick, staff } = useStaffOptions();
  if (!canPick) return null;
  return (
    <SelectField
      label="Assignee"
      value={value}
      onValue={onValue}
      error={error}
      placeholder="Lead owner (default)"
      options={staff.map((s) => ({ value: s.id, label: s.user.fullName + (s.designation ? ` · ${s.designation}` : '') }))}
    />
  );
}
