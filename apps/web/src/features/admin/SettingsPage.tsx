import { useNavigate } from 'react-router-dom';
import { logout } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { PageHeader } from '../../components/ui';
import { humanize } from '../../lib/format';
import { MenuGroup, initials } from './shared';

/** The mobile "More" tab: profile card plus every page this user can open. */
export function SettingsPage() {
  const { me, session, can, tenantName } = useAuth();
  const navigate = useNavigate();
  const name = me?.fullName ?? session?.user.fullName ?? 'INTRA user';
  const email = me?.email ?? session?.user.email ?? '—';

  async function onLogout() {
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Everything else: setup, team and your account." />
      <div className="stack">
        <section className="card admin-profile">
          <span className="admin-avatar" aria-hidden>
            {initials(name)}
          </span>
          <div className="admin-profile-body">
            <strong>{name}</strong>
            <span className="muted">{email}</span>
            <span className="muted small">
              {[tenantName, ...(me?.roles ?? []).map((r) => humanize(r.split('.').pop()))].filter(Boolean).join(' · ')}
            </span>
          </div>
        </section>

        <div className="admin-grid">
          <MenuGroup
            title="Daily work"
            links={[
              { to: '/search', title: 'Search', show: can(P.leadRead) },
              { to: '/timeline', title: 'Timeline', show: can(P.leadRead) },
              { to: '/pipeline', title: 'Pipeline', show: can(P.leadRead) },
              { to: '/visits', title: 'Site visits', show: can(P.siteVisitRead) },
              { to: '/attendance', title: 'Attendance', show: can(P.attendanceRead) },
              { to: '/quotations', title: 'Quotations', show: can(P.quotationRead) },
              { to: '/warranties', title: 'Warranties', show: can(P.warrantyRead) },
              { to: '/verify-warranty', title: 'Verify warranty' },
            ]}
          />
          <MenuGroup
            title="Performance"
            links={[
              { to: '/dashboard', title: 'Founder dashboard', show: can(P.dashboardRead) },
              { to: '/dashboard/me', title: 'My dashboard', show: can(P.dashboardSelf) },
              { to: '/targets', title: 'Targets', show: can(P.targetRead) },
              { to: '/performance', title: 'Target & Achievement', show: can(P.performanceRead) },
              { to: '/reports', title: 'Reports' },
            ]}
          />
          <MenuGroup
            title="Team & setup"
            links={[
              { to: '/staff', title: 'Staff', show: can(P.tenantManageUsers) },
              { to: '/teams', title: 'Teams', show: can(P.tenantManageUsers) },
              { to: '/members', title: 'Members & roles', show: can(P.tenantManageUsers) },
              {
                to: '/settings/general',
                title: 'General settings',
                subtitle: 'Taxes and catalog',
                show: can(P.tenantManageSettings),
              },
              { to: '/catalog', title: 'Catalog', show: can(P.tenantManageSettings) },
              { to: '/roles', title: 'Roles', show: can(P.tenantManageRoles) },
              { to: '/rbac/matrix', title: 'Permission matrix', show: can(P.tenantManageRoles) },
            ]}
          />
          <MenuGroup
            title="Account"
            links={[
              { to: '/change-password', title: 'Change password' },
              { to: '/sessions', title: 'Devices & sessions', subtitle: 'Active sessions and login history' },
              { to: '/settings/notifications', title: 'Notification preferences', show: can(P.notificationRead) },
            ]}
          >
            <li>
              <button type="button" className="admin-menu-btn" onClick={onLogout}>
                <span className="admin-menu-title">Sign out</span>
              </button>
            </li>
          </MenuGroup>
        </div>
      </div>
    </>
  );
}
