import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { adminApi, adminKeys, type StaffStatus } from './api';
import { staffStatusLabel } from './logic';
import { BackLink } from './shared';

const STATUS_CHIPS: Array<{ id: StaffStatus | ''; label: string }> = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'invited', label: 'Invited' },
  { id: 'suspended', label: 'Inactive' },
];

/** Mobile StaffListPage: status chips, search, tap a row for details. Also serves /members. */
export function StaffPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as StaffStatus | '';
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim(), 300);

  const query = useQuery({
    queryKey: [...adminKeys.staff, 'list', { q: debounced, status }],
    queryFn: () => adminApi.staff({ q: debounced || undefined, status: status || undefined }),
  });

  function setStatus(next: string) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('status', next);
        else p.delete('status');
        return p;
      },
      { replace: true },
    );
  }

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader
        title="Staff"
        subtitle="Everyone in this workspace, with their roles and teams."
        actions={
          <>
            <Link className="btn btn-ghost" to="/teams">
              Teams
            </Link>
            <Link className="btn btn-primary" to="/staff/create">
              Add staff
            </Link>
          </>
        }
      />
      <div className="toolbar">
        <div className="btn-row chip-scroll" role="group" aria-label="Staff status">
          {STATUS_CHIPS.map((c) => (
          <button
            key={c.id || 'all'}
            type="button"
            className={`chip${status === c.id ? ' chip-active' : ''}`}
            aria-pressed={status === c.id}
            onClick={() => setStatus(c.id)}
          >
            {c.label}
          </button>
          ))}
        </div>
        <input
          type="search"
          className="input"
          placeholder="Search name, email or employee code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search staff"
        />
      </div>
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data!.length === 0 ? (
        <EmptyState>{debounced || status ? 'No staff match these filters.' : 'No staff yet. Add your first team member.'}</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Roles</th>
                <th>Teams</th>
                <th>Status</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {query.data!.map((s) => (
                <tr key={s.id} className="row-link" onClick={() => navigate(`/staff/${s.id}`)}>
                  <td>
                    <Link to={`/staff/${s.id}`} onClick={(e) => e.stopPropagation()}>
                      {s.user.fullName}
                    </Link>
                    <div className="muted small">{s.user.email ?? ''}</div>
                  </td>
                  <td>
                    {s.designation ?? '—'}
                    {s.employeeCode ? <div className="muted small">{s.employeeCode}</div> : null}
                  </td>
                  <td>{s.roles.map((r) => r.name).join(', ') || '—'}</td>
                  <td>{s.teams.map((t) => t.name).join(', ') || '—'}</td>
                  <td>
                    <StaffStatusBadge active={s.active} status={s.status} />
                  </td>
                  <td>{formatDateTime(s.user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function StaffStatusBadge({ active, status }: { active: boolean; status: string }) {
  const label = staffStatusLabel({ active, status });
  return <Badge value={label} tone={label === 'active' ? 'success' : label === 'invited' ? 'warning' : 'danger'} />;
}
