import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens/app_colors.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../dashboard/domain/dashboard.dart';

class AppNavDrawer extends ConsumerWidget {
  const AppNavDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final path = GoRouterState.of(context).uri.path;
    final user = ref.watch(authControllerProvider).user;
    return Drawer(
      backgroundColor: AppColors.canvas,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Text(
              AppStrings.appTitle,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: AppColors.teal,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              user?.fullName ?? user?.email ?? 'Workspace',
              style: const TextStyle(color: AppColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            _item(context, Icons.home_outlined, 'Home', path == AppRoutes.dashboard, () {
              Navigator.pop(context);
              context.go(AppRoutes.dashboard);
            }),
            _item(context, Icons.people_outline, AppStrings.leads, path == AppRoutes.leads, () {
              Navigator.pop(context);
              context.go(AppRoutes.leads);
            }),
            _item(context, Icons.bar_chart_outlined, AppStrings.reports, path == AppRoutes.reports, () {
              Navigator.pop(context);
              context.go(AppRoutes.reports);
            }),
            _item(context, Icons.menu, 'More', path == AppRoutes.settings, () {
              Navigator.pop(context);
              context.go(AppRoutes.settings);
            }),
            const SizedBox(height: 8),
            _item(context, Icons.search, AppStrings.search, path == AppRoutes.search, () {
              Navigator.pop(context);
              context.push(AppRoutes.search);
            }),
            _item(context, Icons.task_alt_outlined, 'Follow-ups', path.startsWith(AppRoutes.tasks), () {
              Navigator.pop(context);
              context.push(AppRoutes.tasks);
            }),
            if (user?.canReadQuotation == true)
              _item(context, Icons.request_quote_outlined, AppStrings.quotations, path.startsWith(AppRoutes.quotations), () {
                Navigator.pop(context);
                context.push(AppRoutes.quotations);
              }),
            if (user?.canReadWarranty == true)
              _item(context, Icons.verified_outlined, AppStrings.warranties, path.startsWith(AppRoutes.warranties), () {
                Navigator.pop(context);
                context.push(AppRoutes.warranties);
              }),
            if (user?.canReadAttendance == true)
              _item(context, Icons.fingerprint, AppStrings.attendance, path.startsWith(AppRoutes.attendance), () {
                Navigator.pop(context);
                context.push(AppRoutes.attendance);
              }),
            _item(context, Icons.view_kanban_outlined, AppStrings.pipeline, path == AppRoutes.pipeline, () {
              Navigator.pop(context);
              context.push(AppRoutes.pipeline);
            }),
            if (user?.canReadDashboard == true)
              _item(context, Icons.donut_large_outlined, 'MTD Performance', path.contains('/dashboard/sales'), () {
                Navigator.pop(context);
                context.push(AppRoutes.dashboardWidgetPath(DashboardWidgets.sales));
              }),
            if (user?.canReadPerformance == true)
              _item(context, Icons.emoji_events_outlined, 'Target & Achievement', path.startsWith(AppRoutes.performance), () {
                Navigator.pop(context);
                context.push(AppRoutes.performance);
              }),
            if (user?.canReadNotifications == true)
              _item(context, Icons.notifications_outlined, AppStrings.notifications, path == AppRoutes.notifications, () {
                Navigator.pop(context);
                context.push(AppRoutes.notifications);
              }),
          ],
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: selected ? AppColors.tealSoft : AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(icon, size: 20, color: selected ? AppColors.teal : AppColors.muted),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? AppColors.teal : const Color(0xFF14201D),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MenuDrawerButton extends StatelessWidget {
  const MenuDrawerButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Menu',
      onPressed: () => Scaffold.of(context).openDrawer(),
      icon: const Icon(Icons.menu),
    );
  }
}
