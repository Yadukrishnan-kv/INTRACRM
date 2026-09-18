class AuthUser {
  const AuthUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.tenantId,
    this.membershipId,
    this.roles = const [],
    this.permissions = const [],
  });

  final String id;
  final String fullName;
  final String email;
  final String tenantId;
  final String? membershipId;
  final List<String> roles;
  final List<String> permissions;

  bool can(String permission) => permissions.contains(permission);

  bool get canManageSettings => can('tenant:manage_settings');
  bool get canManageRoles => can('tenant:manage_roles');
  bool get canManageUsers => can('tenant:manage_users');
  bool get canCreateLead => can('lead:create');
  bool get canReadLead => can('lead:read');
  bool get canUpdateLead => can('lead:update');
  bool get canAssignLead => can('lead:assign');
  bool get canChangeStage => can('lead:change_stage');
  bool get canCreateActivity => can('activity:create');
  bool get canCreateFollowUp => can('follow_up:create');
  bool get canReadFollowUp => can('follow_up:read');
  bool get canUpdateFollowUp => can('follow_up:update');
  bool get canCompleteFollowUp => can('follow_up:complete');
  bool get canCreateSiteVisit => can('site_visit:create');
  bool get canReadSiteVisit => can('site_visit:read');
  bool get canCompleteSiteVisit => can('site_visit:complete');
  bool get canPunchAttendance => can('attendance:punch');
  bool get canReadAttendance => can('attendance:read');
  bool get canReadTeamAttendance => can('attendance:read_team');
  bool get canCreateQuotation => can('quotation:create');
  bool get canReadQuotation => can('quotation:read');
  bool get canSendQuotation => can('quotation:send');
  bool get canAcceptQuotation => can('quotation:accept');
  bool get canReadTarget => can('target:read');
  bool get canManageTarget => can('target:manage');
  bool get canReadPerformance => can('performance:read');
  bool get canReadDashboard => can('dashboard:read');
  bool get canReadStaffDashboard => can('dashboard:self');
  bool get canCreateWarranty => can('warranty:create');
  bool get canReadWarranty => can('warranty:read');
  bool get canUpdateWarranty => can('warranty:update');
  bool get canReadNotifications => can('notification:read');
  bool get canManageNotifications => can('notification:manage');
  bool get canReadAudit => can('audit:read');
  bool get canReadBilling => can('billing:read');
  bool get canSyncBilling => can('billing:sync');
}
