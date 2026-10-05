export const SYSTEM_ROLE = {
  founder: 'tenant.founder',
  admin: 'tenant.admin',
  businessManager: 'business.manager',
  salesStaff: 'sales.staff',
} as const;

export const PRODUCT_ROLE_CODES = [
  SYSTEM_ROLE.founder,
  SYSTEM_ROLE.admin,
  SYSTEM_ROLE.businessManager,
  SYSTEM_ROLE.salesStaff,
] as const;

export const PERMISSION = {
  tenantManageUsers: 'tenant:manage_users',
  tenantManageRoles: 'tenant:manage_roles',
  tenantManageSettings: 'tenant:manage_settings',
  leadCreate: 'lead:create',
  leadRead: 'lead:read',
  leadUpdate: 'lead:update',
  leadAssign: 'lead:assign',
  leadChangeStage: 'lead:change_stage',
  leadExport: 'lead:export',
  activityCreate: 'activity:create',
  activityRead: 'activity:read',
  followUpCreate: 'follow_up:create',
  followUpRead: 'follow_up:read',
  followUpUpdate: 'follow_up:update',
  followUpComplete: 'follow_up:complete',
  siteVisitCreate: 'site_visit:create',
  siteVisitRead: 'site_visit:read',
  siteVisitComplete: 'site_visit:complete',
  attendancePunch: 'attendance:punch',
  attendanceRead: 'attendance:read',
  attendanceReadTeam: 'attendance:read_team',
  quotationSend: 'quotation:send',
  quotationCreate: 'quotation:create',
  quotationRead: 'quotation:read',
  quotationAccept: 'quotation:accept',
  targetRead: 'target:read',
  targetManage: 'target:manage',
  performanceRead: 'performance:read',
  dashboardRead: 'dashboard:read',
  dashboardSelf: 'dashboard:self',
  warrantyCreate: 'warranty:create',
  warrantyRead: 'warranty:read',
  warrantyUpdate: 'warranty:update',
  notificationRead: 'notification:read',
  notificationManage: 'notification:manage',
  incentiveRead: 'incentive:read',
  incentiveManage: 'incentive:manage',
  billingRead: 'billing:read',
  billingSync: 'billing:sync',
  auditRead: 'audit:read',
} as const;

export const ROLE_CODE_RULE = /^[a-z][a-z0-9_.]*$/;

export const RBAC_CACHE_TTL_SECONDS = 60;
