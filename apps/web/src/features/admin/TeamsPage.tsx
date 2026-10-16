import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { CheckboxField, TextField } from '../../components/form';
import { ConfirmModal, Modal } from '../../components/Modal';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys, type StaffMember, type Team } from './api';
import { sameMembers, toggleIn, validateTeam } from './logic';
import { BackLink } from './shared';

type Dialog = { kind: 'create' } | { kind: 'edit'; team: Team } | { kind: 'members'; team: Team } | { kind: 'delete'; team: Team } | null;

const invalidate = [adminKeys.teams, adminKeys.staff];

/** Mobile TeamsPage: list, create, rename/deactivate, replace members, delete. */
export function TeamsPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const teams = useQuery({ queryKey: adminKeys.teams, queryFn: adminApi.teams });
  const staff = useQuery({ queryKey: [...adminKeys.staff, 'list', {}], queryFn: () => adminApi.staff({}) });
  const close = () => setDialog(null);

  const remove = useApiMutation((id: string) => adminApi.deleteTeam(id), { success: 'Team deleted', invalidate, onSuccess: close });

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader
        title="Teams"
        subtitle="Group staff for targets, reports and lead routing."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'create' })}>
            New team
          </button>
        }
      />
      {teams.isLoading ? (
        <Spinner />
      ) : teams.isError ? (
        <ErrorState error={teams.error} onRetry={() => teams.refetch()} />
      ) : teams.data!.length === 0 ? (
        <EmptyState>No teams yet. Create one to group your staff.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Members</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {teams.data!.map((team) => (
                <tr key={team.id}>
                  <td>
                    <strong>{team.name}</strong>
                    <div className="muted small">{team.code}</div>
                  </td>
                  <td>
                    {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                    {team.members.length ? (
                      <div className="muted small">
                        {team.members
                          .slice(0, 4)
                          .map((m) => m.fullName)
                          .join(', ')}
                        {team.members.length > 4 ? ` +${team.members.length - 4}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Badge value={team.isActive ? 'active' : 'inactive'} tone={team.isActive ? 'success' : 'neutral'} />
                  </td>
                  <td>
                    <div className="btn-row admin-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'members', team })}>
                        Members
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'edit', team })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost btn-ghost-danger btn-sm" onClick={() => setDialog({ kind: 'delete', team })}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'create' ? <TeamCreateModal onClose={close} /> : null}
      {dialog?.kind === 'edit' ? <TeamEditModal team={dialog.team} onClose={close} /> : null}
      {dialog?.kind === 'members' ? (
        <TeamMembersModal team={dialog.team} staff={staff.data} staffError={staff.error} onClose={close} />
      ) : null}
      <ConfirmModal
        open={dialog?.kind === 'delete'}
        title="Delete team?"
        message={dialog?.kind === 'delete' ? `Delete ${dialog.team.name}? Staff stay in the directory.` : ''}
        confirmLabel="Delete team"
        danger
        busy={remove.isPending}
        onConfirm={() => dialog?.kind === 'delete' && remove.mutate(dialog.team.id)}
        onClose={close}
      />
    </>
  );
}

function TeamCreateModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useApiMutation(() => adminApi.createTeam({ name: name.trim(), code: code.trim().toLowerCase() }), {
    success: 'Team created',
    invalidate,
    onSuccess: onClose,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateTeam(name, code);
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate(undefined);
  }

  return (
    <Modal
      open
      title="New team"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button type="submit" form="admin-team-create" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create team'}
          </button>
        </>
      }
    >
      <form id="admin-team-create" className="stack" onSubmit={onSubmit} noValidate>
        <TextField label="Team name" required autoFocus value={name} maxLength={80} error={errors.name} onValue={setName} />
        <TextField
          label="Team code"
          required
          value={code}
          maxLength={40}
          error={errors.code}
          hint="Short unique code, e.g. north_sales"
          onValue={setCode}
        />
      </form>
    </Modal>
  );
}

function TeamEditModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const [name, setName] = useState(team.name);
  const [active, setActive] = useState(team.isActive);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation(() => adminApi.updateTeam(team.id, { name: name.trim(), isActive: active }), {
    success: 'Team saved',
    invalidate,
    onSuccess: onClose,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateTeam(name);
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate(undefined);
  }

  return (
    <Modal
      open
      title={`Edit ${team.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="admin-team-edit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save team'}
          </button>
        </>
      }
    >
      <form id="admin-team-edit" className="stack" onSubmit={onSubmit} noValidate>
        <TextField label="Team name" required autoFocus value={name} maxLength={80} error={errors.name} onValue={setName} />
        <CheckboxField label="Active" checked={active} onValue={setActive} />
      </form>
    </Modal>
  );
}

function TeamMembersModal({
  team, staff, staffError, onClose,
}: {
  team: Team;
  staff: StaffMember[] | undefined;
  staffError: unknown;
  onClose: () => void;
}) {
  const initial = team.members.map((m) => m.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [filter, setFilter] = useState('');
  const save = useApiMutation(() => adminApi.setTeamMembers(team.id, [...selected]), {
    success: 'Team members saved',
    invalidate,
    onSuccess: onClose,
  });
  const needle = filter.trim().toLowerCase();
  const rows = (staff ?? []).filter(
    (s) => !needle || s.user.fullName.toLowerCase().includes(needle) || (s.user.email ?? '').toLowerCase().includes(needle),
  );

  return (
    <Modal
      open
      title={`${team.name} members`}
      onClose={onClose}
      footer={
        <>
          <span className="muted small modal-footer-note">
            {selected.size} selected
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending || sameMembers(selected, initial)}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Saving…' : 'Save members'}
          </button>
        </>
      }
    >
      {staffError ? (
        <ErrorState error={staffError} />
      ) : !staff ? (
        <Spinner />
      ) : (
        <div className="stack">
          <input
            type="search"
            className="input"
            placeholder="Filter staff"
            aria-label="Filter staff"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="admin-check-list">
            {rows.map((s) => (
              <CheckboxField
                key={s.id}
                label={s.user.fullName}
                hint={s.user.email ?? s.status}
                checked={selected.has(s.id)}
                onValue={(on) => setSelected((cur) => toggleIn(cur, s.id, on))}
              />
            ))}
            {rows.length === 0 ? <p className="muted small">No staff match.</p> : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
