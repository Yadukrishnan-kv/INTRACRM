import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens/app_colors.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../settings/application/sync_controller.dart';

class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncControllerProvider);
    final canCreate = ref.watch(authControllerProvider).user?.canCreateLead == true;
    final path = GoRouterState.of(context).uri.path;
    const rootTabs = {
      AppRoutes.dashboard,
      AppRoutes.leads,
      AppRoutes.reports,
      AppRoutes.settings,
    };
    final showDock = rootTabs.contains(path);
    return Scaffold(
      body: Column(
        children: [
          if (!sync.online || sync.pendingCount > 0 || sync.conflictCount > 0)
            Material(
              color: !sync.online
                  ? Theme.of(context).colorScheme.tertiaryContainer
                  : Theme.of(context).colorScheme.secondaryContainer,
              child: SafeArea(
                bottom: false,
                child: ListTile(
                  dense: true,
                  leading: Icon(!sync.online ? Icons.cloud_off : Icons.sync),
                  title: Text(
                    !sync.online
                        ? AppStrings.offlineBanner
                        : sync.conflictCount > 0
                        ? AppStrings.syncConflicts
                        : AppStrings.pendingSync,
                  ),
                  subtitle: Text(
                    sync.pendingCount == 0
                        ? AppStrings.offlineMode
                        : '${sync.pendingCount} queued',
                  ),
                  trailing: TextButton(
                    onPressed: sync.syncing
                        ? null
                        : () => ref.read(syncControllerProvider.notifier).syncNow(),
                    child: Text(sync.syncing ? '…' : AppStrings.syncNow),
                  ),
                ),
              ),
            ),
          Expanded(child: navigationShell),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: showDock && canCreate
          ? FloatingActionButton(
              onPressed: () => context.push(AppRoutes.leadCreate),
              child: const Icon(Icons.add, size: 28),
            )
          : null,
      bottomNavigationBar: showDock
          ? BottomAppBar(
              color: AppColors.card,
              elevation: 8,
              shape: const CircularNotchedRectangle(),
              notchMargin: 8,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: SizedBox(
                height: 64,
                child: Row(
                  children: [
                    _NavButton(
                      icon: Icons.home_outlined,
                      selectedIcon: Icons.home,
                      label: 'Home',
                      selected: navigationShell.currentIndex == 0,
                      onTap: () => navigationShell.goBranch(0),
                    ),
                    _NavButton(
                      icon: Icons.people_outline,
                      selectedIcon: Icons.people,
                      label: AppStrings.leads,
                      selected: navigationShell.currentIndex == 1,
                      onTap: () => navigationShell.goBranch(1),
                    ),
                    const SizedBox(width: 64),
                    _NavButton(
                      icon: Icons.bar_chart_outlined,
                      selectedIcon: Icons.bar_chart,
                      label: AppStrings.reports,
                      selected: navigationShell.currentIndex == 2,
                      onTap: () => navigationShell.goBranch(2),
                    ),
                    _NavButton(
                      icon: Icons.menu,
                      selectedIcon: Icons.menu,
                      label: 'More',
                      selected: navigationShell.currentIndex == 3,
                      onTap: () => navigationShell.goBranch(3),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.teal : AppColors.muted;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? selectedIcon : icon, color: color, size: 24),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
