import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/auth/domain/auth_user.dart';
import 'package:intra_leads/router/app_routes.dart';
import 'package:intra_leads/router/route_permissions.dart';

AuthUser _user(List<String> permissions) => AuthUser(
  id: 'u1',
  fullName: 'Test',
  email: 't@example.com',
  tenantId: 't1',
  permissions: permissions,
);

void main() {
  group('permissionRedirect', () {
    test('lets users with the permission through', () {
      final admin = _user(['tenant:manage_users', 'tenant:manage_roles']);
      expect(permissionRedirect(AppRoutes.staff, admin), isNull);
      expect(permissionRedirect('/staff/abc/edit', admin), isNull);
      expect(permissionRedirect(AppRoutes.teams, admin), isNull);
      expect(permissionRedirect(AppRoutes.roles, admin), isNull);
      expect(permissionRedirect(AppRoutes.staffReport, admin), isNull);
    });

    test('redirects users without the permission to the dashboard', () {
      final rep = _user(['lead:read', 'follow_up:read']);
      expect(permissionRedirect(AppRoutes.staff, rep), AppRoutes.dashboard);
      expect(permissionRedirect('/staff/abc', rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.roles, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.permissionMatrix, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.catalog, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.taxesSettings, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.messageTemplates, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.trackReport, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.warrantyReport, rep), AppRoutes.dashboard);
    });

    test('report routes use their own read permission', () {
      final rep = _user(['lead:read', 'follow_up:read']);
      expect(permissionRedirect(AppRoutes.leadReport, rep), isNull);
      expect(permissionRedirect(AppRoutes.followUpReport, rep), isNull);
      expect(permissionRedirect(AppRoutes.quotationReport, rep), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.targetReport, rep), AppRoutes.dashboard);
    });

    test('more specific prefixes win over their parents', () {
      final selfOnly = _user(['dashboard:self', 'target:read']);
      expect(permissionRedirect(AppRoutes.staffFunnelReport, selfOnly), isNull);
      expect(permissionRedirect(AppRoutes.funnelReport, selfOnly), AppRoutes.dashboard);
      expect(permissionRedirect(AppRoutes.targets, selfOnly), isNull);
      expect(permissionRedirect(AppRoutes.targetCreate, selfOnly), AppRoutes.dashboard);
    });

    test('prefix matching is segment-aware', () {
      final rep = _user([]);
      expect(permissionRedirect('/staffing', rep), isNull);
      expect(permissionRedirect('/reports/funnel-x', rep), isNull);
    });

    test('unguarded routes and the dashboard always pass', () {
      final nobody = _user([]);
      expect(permissionRedirect(AppRoutes.dashboard, nobody), isNull);
      expect(permissionRedirect(AppRoutes.leads, nobody), isNull);
      expect(permissionRedirect(AppRoutes.settings, nobody), isNull);
      expect(permissionRedirect(AppRoutes.reports, nobody), isNull);
      expect(permissionRedirect(AppRoutes.changePassword, nobody), isNull);
    });

    test('a missing user is denied guarded routes', () {
      expect(permissionRedirect(AppRoutes.staff, null), AppRoutes.dashboard);
    });

    test('no rule guards the redirect target itself', () {
      for (final rule in routePermissions) {
        expect(rule.matches(noAccessRedirect), isFalse, reason: rule.prefix);
      }
    });
  });
}
