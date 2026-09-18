import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../home/presentation/app_nav_drawer.dart';
import '../../auth/application/auth_controller.dart';
import '../application/sync_controller.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flavor = ref.watch(appFlavorProvider);
    final auth = ref.watch(authControllerProvider);
    final sync = ref.watch(syncControllerProvider);
    final user = auth.user;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      drawer: const AppNavDrawer(),
      appBar: AppBar(
        leading: const MenuDrawerButton(),
        title: const Text('More'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          SectionCard(
            child: Row(
              children: [
                InitialsAvatar(name: user?.fullName ?? user?.email ?? 'User', size: 52),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.fullName ?? 'INTRA user',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      Text(user?.email ?? '—', style: const TextStyle(color: AppColors.muted)),
                      Text(
                        '${flavor.env.name} · ${sync.online ? 'Online' : 'Offline'}',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _group(context, 'Daily work', [
            IconMenuTile(icon: Icons.search, title: AppStrings.search, onTap: () => context.push(AppRoutes.search)),
            IconMenuTile(icon: Icons.timeline, title: AppStrings.timeline, onTap: () => context.push(AppRoutes.timeline)),
            IconMenuTile(icon: Icons.view_kanban_outlined, title: AppStrings.pipeline, onTap: () => context.push(AppRoutes.pipeline)),
            if (user?.canReadSiteVisit == true)
              IconMenuTile(icon: Icons.location_on_outlined, title: AppStrings.siteVisits, onTap: () => context.push(AppRoutes.siteVisits)),
            if (user?.canReadAttendance == true)
              IconMenuTile(icon: Icons.fingerprint, title: AppStrings.attendance, onTap: () => context.push(AppRoutes.attendance)),
            if (user?.canReadQuotation == true)
              IconMenuTile(icon: Icons.request_quote_outlined, title: AppStrings.quotations, onTap: () => context.push(AppRoutes.quotations)),
            if (user?.canReadWarranty == true)
              IconMenuTile(icon: Icons.verified_outlined, title: AppStrings.warranties, onTap: () => context.push(AppRoutes.warranties)),
            IconMenuTile(
              icon: Icons.qr_code_scanner,
              title: AppStrings.verifyWarranty,
              onTap: () => context.push(AppRoutes.verifyWarranty),
            ),
          ]),
          const SizedBox(height: 12),
          _group(context, 'Performance', [
            if (user?.canReadDashboard == true)
              IconMenuTile(icon: Icons.dashboard_outlined, title: AppStrings.founderDashboard, onTap: () => context.go(AppRoutes.dashboard)),
            if (user?.canReadStaffDashboard == true)
              IconMenuTile(icon: Icons.person_outline, title: AppStrings.staffDashboard, onTap: () => context.push(AppRoutes.staffDashboard)),
            if (user?.canReadTarget == true)
              IconMenuTile(icon: Icons.flag_outlined, title: AppStrings.targets, onTap: () => context.push(AppRoutes.targets)),
            if (user?.canReadPerformance == true)
              IconMenuTile(
                icon: Icons.emoji_events_outlined,
                title: 'Target & Achievement',
                onTap: () => context.push(AppRoutes.performance),
              ),
            IconMenuTile(icon: Icons.bar_chart, title: AppStrings.reports, onTap: () => context.go(AppRoutes.reports)),
          ]),
          const SizedBox(height: 12),
          if (user?.canManageUsers == true || user?.canManageRoles == true || user?.canManageSettings == true) ...[
            _group(context, 'Team & setup', [
              if (user?.canManageUsers == true)
                IconMenuTile(icon: Icons.groups_outlined, title: AppStrings.staff, onTap: () => context.push(AppRoutes.staff)),
              if (user?.canManageUsers == true)
                IconMenuTile(icon: Icons.account_tree_outlined, title: AppStrings.teams, onTap: () => context.push(AppRoutes.teams)),
              if (user?.canManageSettings == true)
                IconMenuTile(icon: Icons.tune_outlined, title: AppStrings.generalSettings, onTap: () => context.push(AppRoutes.generalSettings)),
              if (user?.canManageSettings == true)
                IconMenuTile(icon: Icons.inventory_2_outlined, title: AppStrings.catalog, onTap: () => context.push(AppRoutes.catalog)),
              if (user?.canManageRoles == true)
                IconMenuTile(icon: Icons.admin_panel_settings_outlined, title: AppStrings.roles, onTap: () => context.push(AppRoutes.roles)),
              if (user?.canManageRoles == true)
                IconMenuTile(icon: Icons.grid_view_outlined, title: AppStrings.permissionMatrix, onTap: () => context.push(AppRoutes.permissionMatrix)),
            ]),
            const SizedBox(height: 12),
          ],
          _group(context, 'Account', [
            IconMenuTile(
              icon: Icons.sync,
              title: AppStrings.offlineMode,
              subtitle: [
                sync.online ? 'Online' : 'Offline',
                '${sync.pendingCount} queued',
                if (sync.lastError != null) sync.lastError!,
              ].join(' · '),
              onTap: sync.syncing ? () {} : () => ref.read(syncControllerProvider.notifier).syncNow(),
            ),
            IconMenuTile(icon: Icons.lock_outline, title: AppStrings.changePassword, onTap: () => context.push(AppRoutes.changePassword)),
            IconMenuTile(icon: Icons.devices_outlined, title: AppStrings.devicesAndSessions, onTap: () => context.push(AppRoutes.sessions)),
            if (user?.canReadNotifications == true)
              IconMenuTile(
                icon: Icons.notifications_outlined,
                title: AppStrings.notificationPreferences,
                onTap: () => context.push(AppRoutes.notificationPreferences),
              ),
          ]),
          if (sync.conflicts.isNotEmpty) ...[
            const SizedBox(height: 12),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(AppStrings.syncConflicts, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  for (final conflict in sync.conflicts)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(conflict.title),
                      subtitle: const Text('Server kept ownership and stage. Local notes and fields were merged.'),
                      trailing: TextButton(
                        onPressed: () => ref.read(syncControllerProvider.notifier).acknowledgeConflict(conflict.id),
                        child: const Text(AppStrings.acknowledgeConflict),
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          FilledButton.tonal(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            child: const Text('Sign out'),
          ),
          const SizedBox(height: 8),
          Text(
            flavor.apiBaseUrl,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: AppColors.muted),
          ),
        ],
      ),
    );
  }

  Widget _group(BuildContext context, String title, List<Widget> children) {
    final visible = [for (final child in children) child];
    if (visible.isEmpty) {
      return const SizedBox.shrink();
    }
    return SectionCard(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
            child: Text(title, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.muted)),
          ),
          ...visible,
        ],
      ),
    );
  }
}
