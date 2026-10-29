import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { FormActions, FormError, TextField } from '../../components/form';
import { ConfirmModal, Modal } from '../../components/Modal';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys } from './api';
import { MIN_PASSWORD_LENGTH, validatePassword } from './logic';
import { BackLink } from './shared';
import { StaffStatusBadge } from './StaffPage';

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters with a letter and a number.`;

/** Mobile StaffDetailPage: profile facts, edit, performance link and the active toggle. */
export function StaffDetailPage() {
  const { staffId = '' } = useParams();
  const { can } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const query = useQuery({
    queryKey: [...adminKeys.staff, 'detail', staffId],
    queryFn: () => adminApi.staffMember(staffId),
  });

  const toggle = useApiMutation((active: boolean) => adminApi.setStaffActive(staffId, active), {
    success: (s) => (s.active ? 'Staff member activated' : 'Staff member deactivated'),
    invalidate: [adminKeys.staff, adminKeys.teams, adminKeys.memberships],
    onSuccess: () => setConfirm(false),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const staff = query.data!;

  return (
    <>
      <BackLink to="/staff" label="Staff" />
      <PageHeader
        title={staff.user.fullName}
        subtitle={<StaffStatusBadge active={staff.active} status={staff.status} />}
        actions={
          <>
            {can(P.performanceRead) ? (
              <Link className="btn btn-ghost" to={`/performance/${staff.id}`}>
                Performance
              </Link>
            ) : null}
            <button
              type="button"
              className={`btn btn-ghost${staff.active ? ' btn-ghost-danger' : ''}`}
              disabled={toggle.isPending}
              onClick={() => (staff.active ? setConfirm(true) : toggle.mutate(true))}
            >
              {staff.active ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(true)}>
              Reset password
            </button>
            <Link className="btn btn-primary" to={`/staff/${staff.id}/edit`}>
              Edit
            </Link>
          </>
        }
      />
      <section className="card">
        <dl className="facts">
          <div>
            <dt>Email</dt>
            <dd>{staff.user.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Designation</dt>
            <dd>{staff.designation ?? '—'}</dd>
          </div>
          <div>
            <dt>Employee code</dt>
            <dd>{staff.employeeCode ?? '—'}</dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{formatDateTime(staff.user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>
              {staff.roles.map((r) => r.name).join(', ') || '—'}{' '}
              <Link className="small" to={`/members/${staff.id}/roles`}>
                Change
              </Link>
            </dd>
          </div>
          <div>
            <dt>Teams</dt>
            <dd>{staff.teams.map((t) => t.name).join(', ') || '—'}</dd>
          </div>
        </dl>
      </section>
      <ConfirmModal
        open={confirm}
        title="Deactivate staff member?"
        message={`${staff.user.fullName} will lose access to this workspace until reactivated.`}
        confirmLabel="Deactivate"
        danger
        busy={toggle.isPending}
        onConfirm={() => toggle.mutate(false)}
        onClose={() => setConfirm(false)}
      />
      <ResetPasswordModal
        open={resetOpen}
        staffId={staff.id}
        email={staff.user.email}
        onClose={() => setResetOpen(false)}
      />
    </>
  );
}

/** Admin-initiated password reset for another staff member. Signs them out of every device. */
function ResetPasswordModal({
  open, staffId, email, onClose,
}: {
  open: boolean;
  staffId: string;
  email: string | null;
  onClose: () => void;
}) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = useApiMutation((newPassword: string) => adminApi.resetStaffPassword(staffId, newPassword), {
    success: 'Password reset. The staff member was signed out of all devices.',
    onSuccess: () => {
      setNext('');
      setConfirm('');
      setErrors({});
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const rule = validatePassword(next, email);
    if (rule) errs.next = rule;
    if (confirm !== next) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length === 0) reset.mutate(next);
  }

  return (
    <Modal open={open} title="Reset password" onClose={onClose}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <p>Set a new password for this staff member. They will be signed out of every device.</p>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          error={errors.next}
          hint={PASSWORD_HINT}
          onValue={setNext}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={errors.confirm}
          onValue={setConfirm}
        />
        <FormError message={reset.error ? errorMessage(reset.error) : null} />
        <FormActions>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={reset.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={reset.isPending}>
            {reset.isPending ? 'Saving…' : 'Reset password'}
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
