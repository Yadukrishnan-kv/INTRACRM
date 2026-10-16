import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { ConfirmModal } from '../../components/Modal';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys } from './api';
import { BackLink } from './shared';
import { StaffStatusBadge } from './StaffPage';

/** Mobile StaffDetailPage: profile facts, edit, performance link and the active toggle. */
export function StaffDetailPage() {
  const { staffId = '' } = useParams();
  const { can } = useAuth();
  const [confirm, setConfirm] = useState(false);
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
    </>
  );
}
