import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../design_system/components/premium_ui.dart';
import '../../../../design_system/tokens/app_colors.dart';
import '../../../../design_system/tokens/app_palette.dart';
import '../../../../router/app_routes.dart';
import '../../application/dashboard_providers.dart';
import '../../domain/dashboard.dart';

/// The six KPI tiles at the top of the founder dashboard.
///
/// Renders nothing at all while loading or on failure: the tiles sit above a
/// dashboard that has its own error handling, and an error card stacked over
/// another error card helps nobody.
class FounderKpiGrid extends ConsumerWidget {
  const FounderKpiGrid({super.key});

  /// Where a tile sends you when tapped.
  static const _routes = <String, String>{
    FounderKpiCodes.todaysFollowUps: AppRoutes.followUpCalendar,
    FounderKpiCodes.mtdBilling: AppRoutes.salesReport,
    FounderKpiCodes.targetAchieved: AppRoutes.salesTarget,
    FounderKpiCodes.activeLeads: AppRoutes.leads,
    FounderKpiCodes.pendingQuotations: AppRoutes.quotations,
    FounderKpiCodes.wonThisMonth: AppRoutes.salesReport,
  };

  static const _icons = <String, IconData>{
    FounderKpiCodes.todaysFollowUps: Icons.event_note_outlined,
    FounderKpiCodes.mtdBilling: Icons.account_balance_wallet_outlined,
    FounderKpiCodes.targetAchieved: Icons.track_changes,
    FounderKpiCodes.activeLeads: Icons.people_outline,
    FounderKpiCodes.pendingQuotations: Icons.description_outlined,
    FounderKpiCodes.wonThisMonth: Icons.check_circle_outline,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kpis = ref.watch(dashboardKpisProvider).asData?.value;
    final data = kpis?.valueOrNull;
    if (data == null || data.items.isEmpty) {
      return const SizedBox.shrink();
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        // Three across on a phone, four once there is room for them.
        final columns = constraints.maxWidth >= 520 ? 4 : 3;
        const gap = 8.0;
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final item in data.items)
              SizedBox(
                width: width,
                child: _KpiTile(
                  item: item,
                  icon: _icons[item.code] ?? Icons.insights_outlined,
                  route: _routes[item.code],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.item, required this.icon, this.route});

  final FounderKpi item;
  final IconData icon;
  final String? route;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final delta = item.deltaLabel;
    return SectionCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: route == null ? null : () => context.push(route!),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20, color: AppColors.info),
              const SizedBox(height: 6),
              FittedBox(
                child: Text(
                  item.valueLabel,
                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                item.title,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
              ),
              if (delta != null) ...[
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      item.deltaIsUp ? Icons.arrow_upward : Icons.arrow_downward,
                      size: 10,
                      color: item.deltaIsUp ? AppColors.success : AppColors.danger,
                    ),
                    Text(
                      delta,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: item.deltaIsUp ? AppColors.success : AppColors.danger,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
