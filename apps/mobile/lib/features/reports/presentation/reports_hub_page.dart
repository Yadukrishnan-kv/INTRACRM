import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../dashboard/domain/dashboard.dart';
import '../../home/presentation/app_nav_drawer.dart';
import '../../auth/application/auth_controller.dart';

class ReportsHubPage extends ConsumerWidget {
  const ReportsHubPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final items = <_ReportLink>[
      if (user?.canReadPerformance == true)
        const _ReportLink(
          title: 'Target & Achievement',
          subtitle: 'Staff targets, achievement, and MTD scores',
          icon: Icons.emoji_events_outlined,
          route: AppRoutes.performance,
        ),
      if (user?.canReadDashboard == true)
        _ReportLink(
          title: 'MTD Performance',
          subtitle: 'Monthly target, achievement, and category mix',
          icon: Icons.donut_large_outlined,
          route: AppRoutes.dashboardWidgetPath(DashboardWidgets.sales),
        ),
      if (user?.canReadDashboard == true)
        const _ReportLink(
          title: AppStrings.funnelReport,
          subtitle: 'Lead → Qualified → Quotation → Negotiation → Won',
          icon: Icons.filter_alt_outlined,
          route: AppRoutes.funnelReport,
        ),
      if (user?.canReadStaffDashboard == true)
        const _ReportLink(
          title: AppStrings.staffFunnelReport,
          subtitle: 'Your personal five-stage funnel',
          icon: Icons.filter_alt_outlined,
          route: AppRoutes.staffFunnelReport,
        ),
      if (user?.canReadDashboard == true)
        const _ReportLink(
          title: AppStrings.analyticsDashboard,
          subtitle: 'Leads, qualified, quotations, won, and conversion',
          icon: Icons.insights_outlined,
          route: AppRoutes.analytics,
        ),
      if (user?.canReadStaffDashboard == true)
        const _ReportLink(
          title: AppStrings.staffAnalytics,
          subtitle: 'Your personal funnel and conversion',
          icon: Icons.person_search_outlined,
          route: AppRoutes.staffAnalytics,
        ),
      if (user?.canReadAudit == true)
        const _ReportLink(
          title: AppStrings.trackReport,
          subtitle: 'Create, update, delete, assignments, and status changes',
          icon: Icons.history_outlined,
          route: AppRoutes.trackReport,
        ),
      if (user?.canReadLead == true)
        const _ReportLink(
          title: AppStrings.leadReport,
          subtitle: 'Pipeline mix, sources, and owners',
          icon: Icons.people_outline,
          route: AppRoutes.leadReport,
        ),
      if (user?.canReadFollowUp == true)
        const _ReportLink(
          title: AppStrings.followUpReport,
          subtitle: 'Completion, overdue, and staff load',
          icon: Icons.task_alt_outlined,
          route: AppRoutes.followUpReport,
        ),
      if (user?.canReadQuotation == true)
        const _ReportLink(
          title: AppStrings.quotationReport,
          subtitle: 'Status, value, and close chance',
          icon: Icons.request_quote_outlined,
          route: AppRoutes.quotationReport,
        ),
      if (user?.canReadQuotation == true)
        const _ReportLink(
          title: AppStrings.salesReport,
          subtitle: 'Won deals, revenue, and win rate',
          icon: Icons.payments_outlined,
          route: AppRoutes.salesReport,
        ),
      if (user?.canReadSiteVisit == true)
        const _ReportLink(
          title: AppStrings.siteVisitReport,
          subtitle: 'Check-ins, GPS, photos, and outcomes',
          icon: Icons.location_on_outlined,
          route: AppRoutes.siteVisitReport,
        ),
      if (user?.canReadAttendance == true)
        const _ReportLink(
          title: AppStrings.attendanceReport,
          subtitle: 'Punch in/out, present, late, and hours',
          icon: Icons.fingerprint,
          route: AppRoutes.attendanceReport,
        ),
      if (user?.canReadPerformance == true)
        const _ReportLink(
          title: AppStrings.performanceReport,
          subtitle: 'Scores, bands, and leaderboard',
          icon: Icons.leaderboard_outlined,
          route: AppRoutes.performanceReport,
        ),
    ];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      drawer: const AppNavDrawer(),
      appBar: AppBar(
        leading: const MenuDrawerButton(),
        title: const Text(AppStrings.reports),
      ),
      body: items.isEmpty
          ? const Center(child: Text('No reports available for this account.'))
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = items[index];
                return SectionCard(
                  padding: EdgeInsets.zero,
                  child: IconMenuTile(
                    icon: item.icon,
                    title: item.title,
                    subtitle: item.subtitle,
                    onTap: () => context.push(item.route),
                  ),
                );
              },
            ),
    );
  }
}

class _ReportLink {
  const _ReportLink({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.route,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String route;
}
