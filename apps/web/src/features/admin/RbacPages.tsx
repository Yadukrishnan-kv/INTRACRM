import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { CheckboxField, FormActions, FormError, FormGrid, TextField } from '../../components/form';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { humanize } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys, type Role } from './api';
import { groupPermissions, sameMembers, toggleIn, validateRole } from './logic';
import { BackLink } from './shared';

/* ---------- Roles ---------- */

/** Mobile RolesPage: every role with its code and permission count; tap opens the matrix. */
export function RolesPage() {
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);
  const query = useQuery({ queryKey: adminKeys.roles, queryFn: adminApi.roles });
  const remove = useApiMutation((id: string) => adminApi.deleteRole(id), {
    success: 'Role deleted',
    invalidate: [adminKeys.roles, adminKeys.matrix],
    onSuccess: () => setPendingDelete(null),
  });

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader
        title="Roles"
        subtitle="Roles bundle permissions. System roles are fixed; custom roles can be edited in the matrix."
        actions={
          <>
            <Link className="btn btn-ghost" to="/rbac/matrix">
              Permission matrix
            </Link>
            <Link className="btn btn-primary" to="/roles/create">
              New role
            </Link>
          </>
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data!.length === 0 ? (
        <EmptyState>No roles yet.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Code</th>
                <th className="num">Permissions</th>
                <th>Type</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {query.data!.map((role) => (
                <tr key={role.id} className="row-link" onClick={() => navigate('/rbac/matrix')}>
                  <td>
                    <strong>{role.name}</strong>
                    {role.description ? <div className="muted small">{role.description}</div> : null}
                  </td>
                  <td className="muted small">{role.code}</td>
                  <td className="num">{role.permissionCodes.length}</td>
                  <td>
                    {role.isSystem ? <Badge value="system" tone="info" /> : <Badge value="custom" tone="neutral" />}
                    {role.isDefault ? <Badge value="default" tone="success" /> : null}
                  </td>
                  <td>
                    {!role.isSystem ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-ghost-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(role);
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.name ?? ''}?`}
        message="Members holding this role lose it and the permissions it grants. This cannot be undone."
        confirmLabel="Delete role"
        danger
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}

/** Mobile RoleFormPage (name, code, description) plus an optional starting permission set. */
export function RoleFormPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const permissions = useQuery({ queryKey: adminKeys.permissions, queryFn: adminApi.permissions });
  const groups = useMemo(() => groupPermissions(permissions.data ?? []), [permissions.data]);

  const create = useApiMutation(
    () =>
      adminApi.createRole({
        code: code.trim().toLowerCase(),
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        permissionCodes: [...codes],
      }),
    { success: 'Role created', invalidate: [adminKeys.roles, adminKeys.matrix], onSuccess: () => navigate('/roles') },
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateRole({ name, code });
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate(undefined);
  }

  return (
    <>
      <BackLink to="/roles" label="Roles" />
      <PageHeader title="New role" />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <FormGrid>
          <TextField label="Role name" required autoFocus value={name} maxLength={120} error={errors.name} onValue={setName} />
          <TextField
            label="Role code"
            required
            value={code}
            maxLength={80}
            error={errors.code}
            hint="e.g. sales.lead or field_tech"
            onValue={setCode}
          />
          <div className="span-2">
            <TextField label="Description" value={description} maxLength={500} onValue={setDescription} />
          </div>
        </FormGrid>
        <div>
          <p className="admin-group-title">Permissions ({codes.size})</p>
          {permissions.isLoading ? (
            <Spinner />
          ) : permissions.isError ? (
            <ErrorState error={permissions.error} onRetry={() => permissions.refetch()} />
          ) : (
            <div className="stack">
              {groups.map((g) => (
                <fieldset key={g.resource} className="admin-fieldset">
                  <legend>{humanize(g.resource)}</legend>
                  <div className="admin-check-grid">
                    {g.items.map((p) => (
                      <CheckboxField
                        key={p.code}
                        label={humanize(p.action)}
                        hint={p.description ?? p.code}
                        checked={codes.has(p.code)}
                        onValue={(on) => setCodes((cur) => toggleIn(cur, p.code, on))}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>
        <FormError message={create.error ? errorMessage(create.error) : null} />
        <FormActions>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/roles')} disabled={create.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create role'}
          </button>
        </FormActions>
      </form>
    </>
  );
}

/* ---------- Matrix ---------- */

/**
 * Mobile PermissionMatrixPage: permissions × roles grid; toggling a box saves that
 * role's permission set right away. System roles are read-only.
 */
export function PermissionMatrixPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: adminKeys.matrix, queryFn: adminApi.matrix });
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (query.data) setDraft(Object.fromEntries(query.data.roles.map((r) => [r.id, new Set(r.permissionCodes)])));
  }, [query.data]);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const perms = (query.data?.permissions ?? []).filter(
      (p) => !needle || p.code.toLowerCase().includes(needle) || (p.description ?? '').toLowerCase().includes(needle),
    );
    return groupPermissions(perms);
  }, [query.data, filter]);

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const roles = query.data!.roles;

  async function toggle(role: Role, code: string) {
    if (role.isSystem) {
      toast.info('System role permissions are fixed.');
      return;
    }
    const before = draft[role.id] ?? new Set<string>();
    const next = toggleIn(before, code);
    setDraft((d) => ({ ...d, [role.id]: next }));
    setSaving(role.id);
    try {
      await adminApi.setRolePermissions(role.id, [...next]);
      await qc.invalidateQueries({ queryKey: adminKeys.roles });
    } catch (err) {
      toast.error(errorMessage(err));
      await query.refetch();
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <BackLink to="/roles" label="Roles" />
      <PageHeader
        title="Permission matrix"
        subtitle={saving ? 'Saving…' : 'Changes to custom roles save as you click. System roles are fixed.'}
      />
      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder="Filter permissions"
          aria-label="Filter permissions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card table-wrap">
        <table className="table table-scroll admin-matrix">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="admin-cell" title={r.code}>
                  {r.name}
                  {r.isSystem ? <div className="muted small">system</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.resource}>
                <tr className="admin-resource">
                  <td colSpan={roles.length + 1}>{humanize(g.resource)}</td>
                </tr>
                {g.items.map((p) => (
                  <tr key={p.code}>
                    <td title={p.description ?? undefined}>
                      <code className="small">{p.code}</code>
                      {p.description ? <div className="muted small">{p.description}</div> : null}
                    </td>
                    {roles.map((r) => (
                      <td key={r.id} className="admin-cell">
                        <input
                          type="checkbox"
                          aria-label={`${r.name}: ${p.code}`}
                          checked={draft[r.id]?.has(p.code) ?? false}
                          disabled={r.isSystem || saving === r.id}
                          onChange={() => toggle(r, p.code)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={roles.length + 1} className="muted">
                  No permissions match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Member roles ---------- */

/** Mobile MemberRolesPage: pick the roles one membership holds (at least one). */
export function MemberRolesPage() {
  const { membershipId = '' } = useParams();
  const navigate = useNavigate();
  const members = useQuery({ queryKey: adminKeys.memberships, queryFn: adminApi.memberships });
  const roles = useQuery({ queryKey: adminKeys.roles, queryFn: adminApi.roles });
  const member = members.data?.find((m) => m.id === membershipId);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (member && !selected) setSelected(new Set(member.roles.map((r) => r.id)));
  }, [member, selected]);

  const save = useApiMutation((ids: string[]) => adminApi.setMemberRoles(membershipId, ids), {
    success: 'Roles saved',
    invalidate: [adminKeys.memberships, adminKeys.staff],
    onSuccess: () => navigate(-1),
  });

  if (members.isLoading || roles.isLoading) return <Spinner />;
  const err = members.error ?? roles.error;
  if (err) return <ErrorState error={err} onRetry={() => (members.error ? members.refetch() : roles.refetch())} />;
  if (!member) return <EmptyState>Member not found.</EmptyState>;
  const current = selected ?? new Set<string>();

  return (
    <>
      <BackLink to={`/staff/${member.id}`} label="Staff member" />
      <PageHeader title={member.user.fullName} subtitle={member.user.email ?? undefined} />
      <section className="card stack">
        <p className="admin-group-title">Roles</p>
        <div className="admin-check-list">
          {roles.data!.map((r) => (
            <CheckboxField
              key={r.id}
              label={r.name}
              hint={r.code}
              checked={current.has(r.id)}
              onValue={(on) => setSelected(toggleIn(current, r.id, on))}
            />
          ))}
        </div>
        {current.size === 0 ? <small className="field-error">Select at least one role.</small> : null}
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending || current.size === 0 || sameMembers(current, member.roles.map((r) => r.id))}
            onClick={() => save.mutate([...current])}
          >
            {save.isPending ? 'Saving…' : 'Save roles'}
          </button>
        </FormActions>
      </section>
    </>
  );
}
