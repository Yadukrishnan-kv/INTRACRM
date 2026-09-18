import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/change_password_page.dart';
import '../features/auth/presentation/forgot_password_page.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/auth/presentation/reset_password_page.dart';
import '../features/auth/presentation/sessions_page.dart';
import '../features/home/presentation/home_shell.dart';
import '../features/leads/presentation/lead_detail_page.dart';
import '../features/leads/presentation/lead_form_page.dart';
import '../features/leads/presentation/lead_list_page.dart';
import '../features/pipeline/presentation/pipeline_analytics_page.dart';
import '../features/pipeline/presentation/pipeline_board_page.dart';
import '../features/timeline/presentation/timeline_page.dart';
import '../features/notifications/presentation/notification_preferences_page.dart';
import '../features/notifications/presentation/notifications_page.dart';
import '../features/rbac/domain/rbac_models.dart';
import '../features/rbac/presentation/member_roles_page.dart';
import '../features/rbac/presentation/members_page.dart';
import '../features/rbac/presentation/permission_matrix_page.dart';
import '../features/rbac/presentation/role_form_page.dart';
import '../features/rbac/presentation/roles_page.dart';
import '../features/search/presentation/search_page.dart';
import '../features/catalog/presentation/catalog_form_page.dart';
import '../features/catalog/presentation/catalog_hub_page.dart';
import '../features/catalog/presentation/catalog_list_page.dart';
import '../features/settings/presentation/settings_page.dart';
import '../features/settings/presentation/general_settings_page.dart';
import '../features/settings/presentation/taxes_settings_page.dart';
import '../features/staff/presentation/staff_detail_page.dart';
import '../features/staff/presentation/staff_form_page.dart';
import '../features/staff/presentation/staff_list_page.dart';
import '../features/staff/presentation/staff_report_page.dart';
import '../features/staff/presentation/teams_page.dart';
import '../features/quotations/presentation/quotation_detail_page.dart';
import '../features/quotations/presentation/quotation_form_page.dart';
import '../features/quotations/presentation/quotation_list_page.dart';
import '../features/quotations/presentation/quotation_report_page.dart';
import '../features/targets/presentation/target_detail_page.dart';
import '../features/targets/presentation/target_form_page.dart';
import '../features/targets/presentation/target_list_page.dart';
import '../features/targets/presentation/target_report_page.dart';
import '../features/dashboard/presentation/dashboard_detail_page.dart';
import '../features/dashboard/presentation/dashboard_page.dart';
import '../features/dashboard/presentation/staff_dashboard_page.dart';
import '../features/analytics/presentation/analytics_detail_page.dart';
import '../features/analytics/presentation/analytics_page.dart';
import '../features/analytics/presentation/funnel_report_page.dart';
import '../features/analytics/presentation/staff_analytics_page.dart';
import '../features/performance/presentation/performance_detail_page.dart';
import '../features/performance/presentation/performance_list_page.dart';
import '../features/performance/presentation/performance_report_page.dart';
import '../features/warranties/presentation/verify_warranty_page.dart';
import '../features/warranties/presentation/warranty_detail_page.dart';
import '../features/warranties/presentation/warranty_form_page.dart';
import '../features/warranties/presentation/warranty_list_page.dart';
import '../features/warranties/presentation/warranty_report_page.dart';
import '../features/warranties/presentation/warranty_scan_page.dart';
import '../features/reports/presentation/follow_up_report_page.dart';
import '../features/reports/presentation/lead_report_page.dart';
import '../features/reports/presentation/reports_hub_page.dart';
import '../features/reports/presentation/sales_report_page.dart';
import '../features/tracks/presentation/track_report_page.dart';
import '../features/site_visits/presentation/site_visit_detail_page.dart';
import '../features/site_visits/presentation/site_visit_form_page.dart';
import '../features/site_visits/presentation/site_visit_list_page.dart';
import '../features/site_visits/presentation/site_visit_report_page.dart';
import '../features/attendance/presentation/attendance_page.dart';
import '../features/attendance/presentation/attendance_report_page.dart';
import '../features/splash/presentation/splash_page.dart';
import '../features/follow_ups/presentation/follow_up_detail_page.dart';
import '../features/follow_ups/presentation/follow_up_form_page.dart';
import '../features/follow_ups/presentation/follow_up_list_page.dart';
import 'app_routes.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen<AuthState>(authControllerProvider, (_, _) {
    refresh.value++;
  });
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: AppRoutes.dashboard,
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final location = state.matchedLocation;
      final publicAuth = AppRoutes.publicAuth.contains(location);
      final publicPortal = AppRoutes.isPublicPortal(location);
      final splashing = location == AppRoutes.splash;

      if (auth.status == AuthStatus.unknown) {
        return splashing || publicPortal ? null : AppRoutes.splash;
      }
      if (!auth.isAuthenticated) {
        return publicAuth || publicPortal ? null : AppRoutes.login;
      }
      if (publicAuth || splashing) {
        return AppRoutes.dashboard;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashPage(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: AppRoutes.forgotPassword,
        builder: (context, state) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: AppRoutes.resetPassword,
        builder: (context, state) {
          return ResetPasswordPage(
            email: state.uri.queryParameters['email'] ?? '',
          );
        },
      ),
      GoRoute(
        path: AppRoutes.verifyWarranty,
        builder: (context, state) => const VerifyWarrantyPage(),
        routes: [
          GoRoute(
            path: 'scan',
            builder: (context, state) => const WarrantyScanPage(),
          ),
          GoRoute(
            path: ':token',
            builder: (context, state) {
              return VerifyWarrantyPage(
                initialToken: state.pathParameters['token'],
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.changePassword,
        builder: (context, state) => const ChangePasswordPage(),
      ),
      GoRoute(
        path: AppRoutes.search,
        builder: (context, state) => const SearchPage(),
      ),
      GoRoute(
        path: AppRoutes.notificationPreferences,
        builder: (context, state) => const NotificationPreferencesPage(),
      ),
      GoRoute(
        path: AppRoutes.sessions,
        builder: (context, state) => const SessionsPage(),
      ),
      GoRoute(
        path: AppRoutes.generalSettings,
        builder: (context, state) => const GeneralSettingsPage(),
      ),
      GoRoute(
        path: AppRoutes.taxesSettings,
        builder: (context, state) => const TaxesSettingsPage(),
      ),
      GoRoute(
        path: AppRoutes.catalog,
        builder: (context, state) => const CatalogHubPage(),
        routes: [
          GoRoute(
            path: ':kind',
            builder: (context, state) {
              return CatalogListPage(kind: state.pathParameters['kind']!);
            },
            routes: [
              GoRoute(
                path: 'create',
                builder: (context, state) {
                  return CatalogFormPage(kind: state.pathParameters['kind']!);
                },
              ),
              GoRoute(
                path: ':id/edit',
                builder: (context, state) {
                  return CatalogFormPage(
                    kind: state.pathParameters['kind']!,
                    itemId: state.pathParameters['id'],
                  );
                },
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.roles,
        builder: (context, state) => const RolesPage(),
      ),
      GoRoute(
        path: AppRoutes.roleCreate,
        builder: (context, state) => const RoleFormPage(),
      ),
      GoRoute(
        path: AppRoutes.permissionMatrix,
        builder: (context, state) => const PermissionMatrixPage(),
      ),
      GoRoute(
        path: AppRoutes.members,
        builder: (context, state) => const StaffListPage(),
      ),
      GoRoute(
        path: AppRoutes.staff,
        builder: (context, state) => const StaffListPage(),
      ),
      GoRoute(
        path: AppRoutes.staffCreate,
        builder: (context, state) => const StaffFormPage(),
      ),
      GoRoute(
        path: AppRoutes.staffDetail,
        builder: (context, state) {
          return StaffDetailPage(staffId: state.pathParameters['staffId']!);
        },
      ),
      GoRoute(
        path: AppRoutes.staffEdit,
        builder: (context, state) {
          return StaffFormPage(staffId: state.pathParameters['staffId']);
        },
      ),
      GoRoute(
        path: AppRoutes.teams,
        builder: (context, state) => const TeamsPage(),
      ),
      GoRoute(
        path: AppRoutes.staffReport,
        builder: (context, state) => const StaffReportPage(),
      ),
      GoRoute(
        path: AppRoutes.pipeline,
        builder: (context, state) => const PipelineBoardPage(),
      ),
      GoRoute(
        path: AppRoutes.pipelineAnalytics,
        builder: (context, state) => const PipelineAnalyticsPage(),
      ),
      GoRoute(
        path: AppRoutes.timeline,
        builder: (context, state) => const TimelinePage(),
      ),
      GoRoute(
        path: AppRoutes.siteVisits,
        builder: (context, state) => const SiteVisitListPage(),
        routes: [
          GoRoute(
            path: 'create',
            builder: (context, state) {
              return SiteVisitFormPage(leadId: state.uri.queryParameters['leadId']);
            },
          ),
          GoRoute(
            path: ':visitId',
            builder: (context, state) {
              return SiteVisitDetailPage(visitId: state.pathParameters['visitId']!);
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.siteVisitReport,
        builder: (context, state) => const SiteVisitReportPage(),
      ),
      GoRoute(
        path: AppRoutes.attendance,
        builder: (context, state) => const AttendancePage(),
      ),
      GoRoute(
        path: AppRoutes.attendanceReport,
        builder: (context, state) => const AttendanceReportPage(),
      ),
      GoRoute(
        path: AppRoutes.quotations,
        builder: (context, state) => const QuotationListPage(),
        routes: [
          GoRoute(
            path: 'create',
            builder: (context, state) {
              return QuotationFormPage(leadId: state.uri.queryParameters['leadId']);
            },
          ),
          GoRoute(
            path: ':quotationId',
            builder: (context, state) {
              return QuotationDetailPage(
                quotationId: state.pathParameters['quotationId']!,
              );
            },
            routes: [
              GoRoute(
                path: 'edit',
                builder: (context, state) {
                  return QuotationFormPage(
                    quotationId: state.pathParameters['quotationId'],
                  );
                },
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.quotationReport,
        builder: (context, state) => const QuotationReportPage(),
      ),
      GoRoute(
        path: AppRoutes.targets,
        builder: (context, state) => const TargetListPage(),
        routes: [
          GoRoute(
            path: 'create',
            builder: (context, state) => const TargetFormPage(),
          ),
          GoRoute(
            path: ':targetId',
            builder: (context, state) {
              return TargetDetailPage(targetId: state.pathParameters['targetId']!);
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.targetReport,
        builder: (context, state) => const TargetReportPage(),
      ),
      GoRoute(
        path: AppRoutes.performance,
        builder: (context, state) => const PerformanceListPage(),
        routes: [
          GoRoute(
            path: ':membershipId',
            builder: (context, state) {
              return PerformanceDetailPage(
                membershipId: state.pathParameters['membershipId']!,
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.performanceReport,
        builder: (context, state) => const PerformanceReportPage(),
      ),
      GoRoute(
        path: AppRoutes.tasks,
        builder: (context, state) => const FollowUpListPage(),
        routes: [
          GoRoute(
            path: 'create',
            builder: (context, state) {
              return FollowUpFormPage(
                leadId: state.uri.queryParameters['leadId'],
              );
            },
          ),
          GoRoute(
            path: ':followUpId',
            builder: (context, state) {
              return FollowUpDetailPage(
                followUpId: state.pathParameters['followUpId']!,
              );
            },
            routes: [
              GoRoute(
                path: 'edit',
                builder: (context, state) {
                  return FollowUpFormPage(
                    followUpId: state.pathParameters['followUpId'],
                  );
                },
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.notifications,
        builder: (context, state) => const NotificationsPage(),
      ),
      GoRoute(
        path: AppRoutes.analytics,
        builder: (context, state) => const AnalyticsPage(),
        routes: [
          GoRoute(
            path: 'me',
            builder: (context, state) => const StaffAnalyticsPage(),
          ),
          GoRoute(
            path: ':metricCode',
            builder: (context, state) {
              return AnalyticsDetailPage(
                metricCode: state.pathParameters['metricCode']!,
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.warranties,
        builder: (context, state) => const WarrantyListPage(),
        routes: [
          GoRoute(
            path: 'create',
            builder: (context, state) {
              return WarrantyFormPage(
                leadId: state.uri.queryParameters['leadId'],
                quotationId: state.uri.queryParameters['quotationId'],
              );
            },
          ),
          GoRoute(
            path: ':warrantyId',
            builder: (context, state) {
              return WarrantyDetailPage(
                warrantyId: state.pathParameters['warrantyId']!,
              );
            },
            routes: [
              GoRoute(
                path: 'edit',
                builder: (context, state) {
                  return WarrantyFormPage(
                    warrantyId: state.pathParameters['warrantyId'],
                  );
                },
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.warrantyReport,
        builder: (context, state) => const WarrantyReportPage(),
      ),
      GoRoute(
        path: AppRoutes.funnelReport,
        builder: (context, state) => const FunnelReportPage(),
      ),
      GoRoute(
        path: AppRoutes.trackReport,
        builder: (context, state) => const TrackReportPage(),
      ),
      GoRoute(
        path: AppRoutes.staffFunnelReport,
        builder: (context, state) => const FunnelReportPage(personal: true),
      ),
      GoRoute(
        path: AppRoutes.leadReport,
        builder: (context, state) => const LeadReportPage(),
      ),
      GoRoute(
        path: AppRoutes.followUpReport,
        builder: (context, state) => const FollowUpReportPage(),
      ),
      GoRoute(
        path: AppRoutes.salesReport,
        builder: (context, state) => const SalesReportPage(),
      ),
      GoRoute(
        path: AppRoutes.memberRoles,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is RbacMembership) {
            return MemberRolesPage(membership: extra);
          }
          return const MembersPage();
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return HomeShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.dashboard,
                builder: (context, state) => const DashboardPage(),
                routes: [
                  GoRoute(
                    path: 'me',
                    builder: (context, state) => const StaffDashboardPage(),
                  ),
                  GoRoute(
                    path: ':widgetCode',
                    builder: (context, state) {
                      return DashboardDetailPage(
                        widgetCode: state.pathParameters['widgetCode']!,
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.leads,
                builder: (context, state) => const LeadListPage(),
                routes: [
                  GoRoute(
                    path: 'create',
                    builder: (context, state) => const LeadFormPage(),
                  ),
                  GoRoute(
                    path: ':leadId',
                    builder: (context, state) {
                      return LeadDetailPage(
                        leadId: state.pathParameters['leadId']!,
                      );
                    },
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (context, state) {
                          return LeadFormPage(
                            leadId: state.pathParameters['leadId'],
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.reports,
                builder: (context, state) => const ReportsHubPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.settings,
                builder: (context, state) => const SettingsPage(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
