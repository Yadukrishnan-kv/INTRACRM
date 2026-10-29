import { request } from '../../api/client';

// Shapes mirror apps/api/src/modules/{directory,identity,catalog}.

/* ---------- Staff & teams (directory) ---------- */

export type StaffStatus = 'active' | 'suspended' | 'invited';

export type RoleRef = { id: string; code: string; name: string };
export type TeamRef = { id: string; code: string; name: string };

export type StaffMember = {
  id: string;
  status: string;
  active: boolean;
  designation: string | null;
  employeeCode: string | null;
  user: { id: string; fullName: string; email: string | null; lastLoginAt: string | null };
  roles: RoleRef[];
  teams: TeamRef[];
};

export type StaffQuery = { q?: string; status?: StaffStatus; teamId?: string; roleId?: string };

export type StaffInput = {
  fullName: string;
  email: string;
  designation?: string;
  employeeCode?: string;
  roleIds: string[];
  teamIds: string[];
  password?: string;
};

export type Team = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  memberCount: number;
  members: Array<{ id: string; fullName: string; email: string | null; status: string }>;
};

/* ---------- RBAC (identity) ---------- */

export type Permission = {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string | null;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  tenantId: string | null;
  permissionCodes: string[];
};

export type PermissionMatrix = { permissions: Permission[]; roles: Role[] };

export type Membership = {
  id: string;
  status: string;
  designation: string | null;
  employeeCode: string | null;
  user: { id: string; fullName: string; email: string | null };
  roles: RoleRef[];
};

/* ---------- Account (auth) ---------- */

export type AuthSessionRow = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
};

export type LoginHistoryRow = {
  id: string;
  result: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string;
  failureReason: string | null;
};

/* ---------- Catalog ---------- */

export const CATALOG_KINDS = [
  'products',
  'categories',
  'sources',
  'lead-statuses',
  'lead-qualities',
  'warranty-periods',
  'taxes',
] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogKindInfo = { code: string; name: string; count: number };

/** Union of every catalog row shape; kind-specific fields are optional. */
export type CatalogItem = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  description?: string | null;
  isActive: boolean;
  sortOrder?: number;
  version: number;
  updatedAt: string;
  // categories
  parentId?: string | null;
  parentName?: string | null;
  // products
  categoryId?: string | null;
  categoryName?: string | null;
  warrantyPeriodId?: string | null;
  warrantyPeriodName?: string | null;
  unitPriceMinor?: number | null;
  currency?: string;
  warrantyMonths?: number | null;
  // warranty periods
  months?: number;
  // lead statuses
  pipelineId?: string;
  isOpen?: boolean;
  isWon?: boolean;
  isLost?: boolean;
  winProbabilityBps?: number;
  // taxes
  rateBps?: number;
  ratePercent?: number;
};

export type CatalogLookups = {
  categories: CatalogItem[];
  warrantyPeriods: CatalogItem[];
};

export type CatalogPayload = Record<string, string | number | boolean | null>;

export type TaxBatchItem = {
  id?: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
  sortOrder: number;
};

const enc = encodeURIComponent;

export const adminApi = {
  // Staff
  staff: (query: StaffQuery) => request<StaffMember[]>('/staff', { query }).then((r) => r.data),
  staffMember: (id: string) => request<StaffMember>(`/staff/${enc(id)}`).then((r) => r.data),
  createStaff: (body: StaffInput) => request<StaffMember>('/staff', { method: 'POST', body }).then((r) => r.data),
  updateStaff: (id: string, body: Partial<StaffInput>) =>
    request<StaffMember>(`/staff/${enc(id)}`, { method: 'PATCH', body }).then((r) => r.data),
  setStaffActive: (id: string, active: boolean) =>
    request<StaffMember>(`/staff/${enc(id)}/status`, { method: 'POST', body: { active } }).then((r) => r.data),
  setStaffRoles: (id: string, roleIds: string[]) =>
    request<StaffMember>(`/staff/${enc(id)}/roles`, { method: 'PUT', body: { roleIds } }).then((r) => r.data),
  setStaffTeams: (id: string, teamIds: string[]) =>
    request<StaffMember>(`/staff/${enc(id)}/teams`, { method: 'PUT', body: { teamIds } }).then((r) => r.data),
  resetStaffPassword: (id: string, newPassword: string) =>
    request<{ id: string; changed: true }>(`/staff/${enc(id)}/password`, {
      method: 'POST',
      body: { newPassword },
    }).then((r) => r.data),

  // Teams
  teams: () => request<Team[]>('/teams').then((r) => r.data),
  createTeam: (body: { code: string; name: string }) =>
    request<Team>('/teams', { method: 'POST', body }).then((r) => r.data),
  updateTeam: (id: string, body: { name?: string; isActive?: boolean }) =>
    request<Team>(`/teams/${enc(id)}`, { method: 'PATCH', body }).then((r) => r.data),
  deleteTeam: (id: string) => request<{ deleted: true }>(`/teams/${enc(id)}`, { method: 'DELETE' }).then((r) => r.data),
  setTeamMembers: (id: string, membershipIds: string[]) =>
    request<Team>(`/teams/${enc(id)}/members`, { method: 'PUT', body: { membershipIds } }).then((r) => r.data),

  // RBAC
  permissions: () => request<Permission[]>('/permissions').then((r) => r.data),
  roles: () => request<Role[]>('/roles').then((r) => r.data),
  role: (id: string) => request<Role>(`/roles/${enc(id)}`).then((r) => r.data),
  createRole: (body: { code: string; name: string; description?: string; permissionCodes: string[] }) =>
    request<Role>('/roles', { method: 'POST', body }).then((r) => r.data),
  updateRole: (id: string, body: { name?: string; description?: string }) =>
    request<Role>(`/roles/${enc(id)}`, { method: 'PATCH', body }).then((r) => r.data),
  deleteRole: (id: string) => request<{ deleted: true }>(`/roles/${enc(id)}`, { method: 'DELETE' }).then((r) => r.data),
  setRolePermissions: (id: string, permissionCodes: string[]) =>
    request<Role>(`/roles/${enc(id)}/permissions`, { method: 'PUT', body: { permissionCodes } }).then((r) => r.data),
  matrix: () => request<PermissionMatrix>('/rbac/matrix').then((r) => r.data),
  memberships: () => request<Membership[]>('/memberships').then((r) => r.data),
  inviteMember: (body: { email: string; fullName: string; roleIds: string[]; designation?: string; employeeCode?: string }) =>
    request<Membership>('/memberships', { method: 'POST', body }).then((r) => r.data),
  updateMembership: (id: string, body: { status?: 'active' | 'suspended' | 'ended'; designation?: string }) =>
    request<Membership>(`/memberships/${enc(id)}`, { method: 'PATCH', body }).then((r) => r.data),
  setMemberRoles: (id: string, roleIds: string[]) =>
    request<Membership>(`/memberships/${enc(id)}/roles`, { method: 'PUT', body: { roleIds } }).then((r) => r.data),

  // Catalog
  catalogOverview: () => request<{ kinds: CatalogKindInfo[] }>('/catalog').then((r) => r.data.kinds),
  catalogLookups: () => request<CatalogLookups>('/catalog/lookups').then((r) => r.data),
  catalogList: (kind: CatalogKind) =>
    request<CatalogItem[]>(`/catalog/${kind}`, { query: { includeInactive: 'true' } }).then((r) => r.data),
  catalogCreate: (kind: CatalogKind, body: CatalogPayload) =>
    request<CatalogItem>(`/catalog/${kind}`, { method: 'POST', body }).then((r) => r.data),
  catalogUpdate: (kind: CatalogKind, id: string, body: CatalogPayload) =>
    request<CatalogItem>(`/catalog/${kind}/${enc(id)}`, { method: 'PATCH', body }).then((r) => r.data),
  catalogDelete: (kind: CatalogKind, id: string) =>
    request<unknown>(`/catalog/${kind}/${enc(id)}`, { method: 'DELETE' }).then((r) => r.data),
  saveTaxes: (items: TaxBatchItem[], deleteIds: string[]) =>
    request<CatalogItem[]>('/catalog/taxes/batch', {
      method: 'POST',
      body: deleteIds.length ? { items, deleteIds } : { items },
    }).then((r) => r.data),

  // Account
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: true }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }).then(
      (r) => r.data,
    ),
  forgotPassword: (email: string) =>
    request<{ accepted: true; debugOtp?: string }>('/auth/forgot-password', { method: 'POST', body: { email } }).then(
      (r) => r.data,
    ),
  resetPassword: (body: { email: string; otp: string; newPassword: string }) =>
    request<{ reset: true }>('/auth/reset-password', { method: 'POST', body }).then((r) => r.data),
  sessions: () => request<AuthSessionRow[]>('/auth/sessions').then((r) => r.data),
  revokeSession: (id: string) =>
    request<{ revoked: true }>(`/auth/sessions/${enc(id)}`, { method: 'DELETE' }).then((r) => r.data),
  revokeOtherSessions: () =>
    request<{ revoked: true }>('/auth/sessions/revoke-others', { method: 'POST' }).then((r) => r.data),
  loginHistory: () => request<LoginHistoryRow[]>('/auth/login-history').then((r) => r.data),
};

export const adminKeys = {
  staff: ['admin', 'staff'] as const,
  teams: ['admin', 'teams'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  matrix: ['admin', 'matrix'] as const,
  memberships: ['admin', 'memberships'] as const,
  catalog: ['admin', 'catalog'] as const,
  sessions: ['admin', 'sessions'] as const,
  loginHistory: ['admin', 'login-history'] as const,
};
