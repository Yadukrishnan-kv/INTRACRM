import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { ChangePasswordPage, ForgotPasswordPage, ResetPasswordPage, SessionsPage } from './AccountPages';
import './admin.css';
import { CatalogFormPage, CatalogHubPage, CatalogListPage } from './CatalogPages';
import { GeneralSettingsPage } from './GeneralSettingsPage';
import { MemberRolesPage, PermissionMatrixPage, RoleFormPage, RolesPage } from './RbacPages';
import { SettingsPage } from './SettingsPage';
import { StaffDetailPage } from './StaffDetailPage';
import { StaffFormPage } from './StaffFormPage';
import { StaffPage } from './StaffPage';
import { TaxesPage } from './TaxesPage';
import { TeamsPage } from './TeamsPage';

const users = [P.tenantManageUsers];
const roles = [P.tenantManageRoles];
const settings = [P.tenantManageSettings];

export const adminModule: FeatureModule = {
  routes: [
    // Settings hub (mobile "More" tab) is open to every signed-in user.
    { path: 'settings', element: <SettingsPage /> },
    { path: 'settings/general', element: guarded(settings, <GeneralSettingsPage />) },
    { path: 'settings/general/taxes', element: guarded(settings, <TaxesPage />) },

    { path: 'catalog', element: guarded(settings, <CatalogHubPage />) },
    { path: 'catalog/:kind', element: guarded(settings, <CatalogListPage />) },
    { path: 'catalog/:kind/create', element: guarded(settings, <CatalogFormPage />) },
    { path: 'catalog/:kind/:id/edit', element: guarded(settings, <CatalogFormPage />) },

    { path: 'staff', element: guarded(users, <StaffPage />) },
    { path: 'staff/create', element: guarded(users, <StaffFormPage />) },
    { path: 'staff/:staffId', element: guarded(users, <StaffDetailPage />) },
    { path: 'staff/:staffId/edit', element: guarded(users, <StaffFormPage />) },
    { path: 'teams', element: guarded(users, <TeamsPage />) },
    // Mobile routes /members to the staff list as well.
    { path: 'members', element: guarded(users, <StaffPage />) },
    { path: 'members/:membershipId/roles', element: guarded(users, <MemberRolesPage />) },

    { path: 'roles', element: guarded(roles, <RolesPage />) },
    { path: 'roles/create', element: guarded(roles, <RoleFormPage />) },
    { path: 'rbac/matrix', element: guarded(roles, <PermissionMatrixPage />) },

    { path: 'change-password', element: <ChangePasswordPage /> },
    { path: 'sessions', element: <SessionsPage /> },
  ],
  publicRoutes: [
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/reset-password', element: <ResetPasswordPage /> },
  ],
  nav: [
    { to: '/settings', label: 'Settings', section: 'Admin', order: 10, end: true },
    { to: '/catalog', label: 'Catalog', section: 'Admin', anyOf: settings, order: 20 },
    { to: '/staff', label: 'Staff', section: 'Admin', anyOf: users, order: 30 },
    { to: '/teams', label: 'Teams', section: 'Admin', anyOf: users, order: 40 },
    { to: '/roles', label: 'Roles', section: 'Admin', anyOf: roles, order: 50 },
    { to: '/change-password', label: 'Change password', section: 'Account', order: 10 },
    { to: '/sessions', label: 'Sessions', section: 'Account', order: 20 },
  ],
};
