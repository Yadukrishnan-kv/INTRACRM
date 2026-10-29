import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { FormActions, FormError, FormGrid, TextField } from '../../components/form';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys } from './api';
import { emptyStaffDraft, staffDraftFromMember, staffPayload, toggleIn, validateStaffDraft, type StaffDraft } from './logic';
import { BackLink, ChipPicker } from './shared';

/** Mobile StaffFormPage: create (invite) or edit a staff member with roles and teams. */
export function StaffFormPage() {
  const { staffId } = useParams();
  const isEdit = !!staffId;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<StaffDraft>(emptyStaffDraft);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roles = useQuery({ queryKey: adminKeys.roles, queryFn: adminApi.roles });
  const teams = useQuery({ queryKey: adminKeys.teams, queryFn: adminApi.teams });
  const existing = useQuery({
    queryKey: [...adminKeys.staff, 'detail', staffId],
    queryFn: () => adminApi.staffMember(staffId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data && !loaded) {
      setDraft(staffDraftFromMember(existing.data));
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const save = useApiMutation(
    (d: StaffDraft) => (isEdit ? adminApi.updateStaff(staffId!, staffPayload(d, true)) : adminApi.createStaff(staffPayload(d))),
    {
      success: isEdit ? 'Staff member saved' : 'Staff member created',
      invalidate: [adminKeys.staff, adminKeys.teams, adminKeys.memberships],
      onSuccess: (s) => navigate(`/staff/${s.id}`, { replace: true }),
    },
  );

  if (roles.isLoading || teams.isLoading || (isEdit && !loaded && existing.isLoading)) return <Spinner />;
  const loadError = roles.error ?? existing.error;
  if (loadError) return <ErrorState error={loadError} onRetry={() => (roles.error ? roles.refetch() : existing.refetch())} />;

  const set = (patch: Partial<StaffDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateStaffDraft(draft, isEdit);
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate(draft);
  }

  const backTo = isEdit ? `/staff/${staffId}` : '/staff';
  return (
    <>
      <BackLink to={backTo} label={isEdit ? 'Staff member' : 'Staff'} />
      <PageHeader title={isEdit ? 'Edit staff' : 'Add staff'} />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <FormGrid>
          <TextField
            label="Full name"
            required
            value={draft.fullName}
            maxLength={120}
            error={errors.fullName}
            onValue={(v) => set({ fullName: v })}
          />
          <TextField
            label="Email"
            type="email"
            required
            autoComplete="off"
            value={draft.email}
            error={errors.email}
            onValue={(v) => set({ email: v })}
          />
          <TextField
            label="Designation"
            value={draft.designation}
            maxLength={80}
            error={errors.designation}
            onValue={(v) => set({ designation: v })}
          />
          <TextField
            label="Employee code"
            value={draft.employeeCode}
            maxLength={40}
            error={errors.employeeCode}
            onValue={(v) => set({ employeeCode: v })}
          />
          {!isEdit ? (
            <TextField
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              value={draft.password}
              error={errors.password}
              hint="At least 10 characters, with a letter and a number."
              onValue={(v) => set({ password: v })}
            />
          ) : null}
        </FormGrid>
        <div>
          <p className="admin-group-title">
            Roles <span className="req">*</span>
          </p>
          <ChipPicker
            options={(roles.data ?? []).map((r) => ({ id: r.id, label: r.name, hint: r.description ?? r.code }))}
            selected={draft.roleIds}
            onToggle={(id) => set({ roleIds: toggleIn(draft.roleIds, id) })}
          />
          {errors.roleIds ? <small className="field-error">{errors.roleIds}</small> : null}
        </div>
        <div>
          <p className="admin-group-title">Teams</p>
          {teams.isError ? (
            <p className="muted small">Teams could not be loaded.</p>
          ) : (
            <ChipPicker
              options={(teams.data ?? []).filter((t) => t.isActive || draft.teamIds.has(t.id)).map((t) => ({ id: t.id, label: t.name }))}
              selected={draft.teamIds}
              onToggle={(id) => set({ teamIds: toggleIn(draft.teamIds, id) })}
            />
          )}
        </div>
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(backTo)} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save staff' : 'Create staff'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
