import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../performance/domain/performance.dart';
import '../application/dashboard_providers.dart';
import '../domain/dashboard.dart';
import 'widgets/dashboard_widget_card.dart';

class StaffDashboardPage extends ConsumerWidget {
  const StaffDashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(staffDashboardProvider);
    return AppScaffold(
      title: AppStrings.staffDashboard,
      body: RefreshIndicator(
        onRefresh: () => ref.read(staffDashboardProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          emptyTitle: 'No personal dashboard',
          emptyMessage: 'Your leads, follow-ups, and targets will appear here.',
          builder: (board) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(board.membership.name, style: Theme.of(context).textTheme.headlineSmall),
                if (board.membership.designation != null)
                  Text(board.membership.designation!),
                Text(
                  [
                    board.month.label,
                    PerformanceBands.title(board.membership.scoreBand),
                    if (board.membership.teamName != null) board.membership.teamName!,
                  ].join(' · '),
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  children: [
                    Chip(label: Text('Score ${board.membership.scoreLabel}')),
                    Chip(label: Text(board.membership.rankLabel)),
                    Chip(
                      label: Text(
                        board.membership.teamRank == null
                            ? 'Team rank —'
                            : 'Team #${board.membership.teamRank}',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(AppStrings.personalKpis, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                for (final kpi in board.kpis) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(kpi.title),
                    subtitle: Text(kpi.detail),
                    trailing: Text(
                      kpi.valueBps == null ? '—' : kpi.valueLabel,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  LinearProgressIndicator(value: kpi.valueBps == null ? 0 : kpi.fraction),
                  const SizedBox(height: AppSpacing.sm),
                ],
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => context.push(
                      AppRoutes.performanceDetailPath(board.membership.id),
                    ),
                    child: const Text(AppStrings.performanceScore),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(AppStrings.targetTracking, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                if (board.targets.isEmpty)
                  const Text('No current membership or team targets.'),
                for (final target in board.targets)
                  Card(
                    child: ListTile(
                      title: Text(target.displayTitle),
                      subtitle: Text(
                        [
                          target.periodLabel,
                          target.percentLabel,
                          target.forecastLabel,
                          'Daily ${target.dailyRequiredLabel}',
                        ].join(' · '),
                      ),
                      trailing: Text(target.achievedLabel),
                      onTap: () => context.push(AppRoutes.targetDetailPath(target.id)),
                    ),
                  ),
                if (board.targets.isNotEmpty)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => context.push(AppRoutes.targets),
                      child: const Text(AppStrings.targets),
                    ),
                  ),
                const SizedBox(height: AppSpacing.lg),
                Text(AppStrings.performanceWidgets, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                for (final widget in board.orderedWidgets) ...[
                  DashboardWidgetCard(
                    data: widget,
                    onTap: () => context.push(_widgetRoute(widget.code)),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  String _widgetRoute(String code) {
    return switch (code) {
      DashboardWidgets.leads => AppRoutes.leads,
      DashboardWidgets.followUps => AppRoutes.tasks,
      DashboardWidgets.quotations => AppRoutes.quotations,
      DashboardWidgets.orders => AppRoutes.quotationReport,
      DashboardWidgets.sales => AppRoutes.targets,
      _ => AppRoutes.staffDashboard,
    };
  }
}
