import '../features/auth/domain/auth_user.dart';
import 'app_routes.dart';

/// A route path prefix and the permission check a user must pass to open it.
class RoutePermission {
  const RoutePermission(this.prefix, this.allows);

  final String prefix;
  final bool Function(AuthUser user) allows;

  /// True when [path] is [prefix] itself or a sub-path of it (segment-aware,
  /// so `/reports/funnel` does not match `/reports/funnel-x`).
  bool matches(String path) => path == prefix || path.startsWith('$prefix/');
}

/// Route-level permission rules, checked in order; the first matching prefix
/// wins, so more specific prefixes must come before their parents.
///
/// Codes mirror `apps/api/src/modules/identity/domain/system-roles.ts` and the
/// `@RequirePermissions` on the endpoints each page calls.
final routePermissions = <RoutePermission>[
  // Team & setup
  RoutePermission(AppRoutes.staff, (u) => u.canManageUsers),
  RoutePermission(AppRoutes.teams, (u) => u.canManageUsers),
  RoutePermission(AppRoutes.roles, (u) => u.canManageRoles),
  RoutePermission('/rbac', (u) => u.canManageRoles),
  RoutePermission(AppRoutes.catalog, (u) => u.canManageSettings),
  RoutePermission(AppRoutes.messageTemplates, (u) => u.canManageSettings),
  RoutePermission(AppRoutes.generalSettings, (u) => u.canManageSettings),

  // Reports
  RoutePermission(AppRoutes.staffReport, (u) => u.canManageUsers),
  RoutePermission(AppRoutes.leadReport, (u) => u.canReadLead),
  RoutePermission(AppRoutes.pipelineAnalytics, (u) => u.canReadLead),
  RoutePermission(AppRoutes.followUpReport, (u) => u.canReadFollowUp),
  RoutePermission(AppRoutes.quotationReport, (u) => u.canReadQuotation),
  RoutePermission(AppRoutes.salesReport, (u) => u.canReadQuotation),
  RoutePermission(AppRoutes.siteVisitReport, (u) => u.canReadSiteVisit),
  RoutePermission(AppRoutes.attendanceReport, (u) => u.canReadAttendance),
  RoutePermission(AppRoutes.targetReport, (u) => u.canReadTarget),
  RoutePermission(AppRoutes.performanceReport, (u) => u.canReadPerformance),
  RoutePermission(AppRoutes.staffFunnelReport, (u) => u.canReadStaffDashboard),
  RoutePermission(AppRoutes.funnelReport, (u) => u.canReadDashboard),
  RoutePermission(AppRoutes.trackReport, (u) => u.canReadAudit),
  RoutePermission(AppRoutes.warrantyReport, (u) => u.canReadWarranty),
  RoutePermission(AppRoutes.incentiveReport, (u) => u.canReadIncentive),

  // Feature areas
  RoutePermission(AppRoutes.incentivePlanCreate, (u) => u.canManageIncentive),
  RoutePermission(AppRoutes.incentivePlans, (u) => u.canReadIncentive),
  RoutePermission(AppRoutes.targetCreate, (u) => u.canManageTarget),
  RoutePermission(AppRoutes.targets, (u) => u.canReadTarget),
  RoutePermission(AppRoutes.quotationCreate, (u) => u.canCreateQuotation),
  RoutePermission(AppRoutes.quotations, (u) => u.canReadQuotation),
  RoutePermission(AppRoutes.warranties, (u) => u.canReadWarranty),
  RoutePermission(AppRoutes.siteVisitCreate, (u) => u.canCreateSiteVisit),
  RoutePermission(AppRoutes.siteVisits, (u) => u.canReadSiteVisit),
  RoutePermission(AppRoutes.attendance, (u) => u.canReadAttendance),
  RoutePermission(AppRoutes.followUpCreate, (u) => u.canCreateFollowUp),
  RoutePermission(AppRoutes.tasks, (u) => u.canReadFollowUp),
  RoutePermission(AppRoutes.leadCreate, (u) => u.canCreateLead),
  RoutePermission(AppRoutes.pipeline, (u) => u.canReadLead),
  RoutePermission(AppRoutes.timeline, (u) => u.canReadActivity),
  RoutePermission(AppRoutes.performance, (u) => u.canReadPerformance),
  RoutePermission(AppRoutes.staffAnalytics, (u) => u.canReadStaffDashboard),
  RoutePermission(AppRoutes.analytics, (u) => u.canReadDashboard),
  RoutePermission(AppRoutes.staffDashboard, (u) => u.canReadStaffDashboard),
  RoutePermission(AppRoutes.notifications, (u) => u.canReadNotifications),
];

/// Where users are sent when they open a route they are not allowed to see.
const noAccessRedirect = AppRoutes.dashboard;

/// Returns the redirect target when [user] may not open [path], else null.
String? permissionRedirect(String path, AuthUser? user, {List<RoutePermission>? rules}) {
  if (path == noAccessRedirect) {
    return null;
  }
  for (final rule in rules ?? routePermissions) {
    if (rule.matches(path)) {
      final allowed = user != null && rule.allows(user);
      return allowed ? null : noAccessRedirect;
    }
  }
  return null;
}
