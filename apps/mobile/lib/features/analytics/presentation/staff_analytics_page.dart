import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../dashboard/presentation/widgets/dashboard_widget_card.dart';
import '../application/analytics_providers.dart';
import '../domain/analytics.dart';
import 'widgets/funnel_chart.dart';

class StaffAnalyticsPage extends ConsumerWidget {
  const StaffAnalyticsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(staffAnalyticsProvider);
    return AppScaffold(
      title: AppStrings.staffAnalytics,
      body: RefreshIndicator(
        onRefresh: () => ref.read(staffAnalyticsProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          isEmpty: (board) => board.ordered.isEmpty,
          emptyTitle: 'No personal analytics',
          emptyMessage: 'Your leads, qualifications, quotations, and wins will appear here.',
          builder: (board) {
            final conversion = board.monthFunnel.conversion;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(board.month.label, style: Theme.of(context).textTheme.titleMedium),
                Text('Today ${board.today} · ${board.timezone}'),
                const SizedBox(height: AppSpacing.md),
                Text(AppStrings.funnel, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                FunnelChart(funnel: board.monthFunnel),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    Chip(label: Text('${AppStrings.conversion} ${analyticsPercent(conversion.overallBps)}')),
                    Chip(
                      label: Text('Lead → Qualified ${analyticsPercent(conversion.leadToQualifiedBps)}'),
                    ),
                    Chip(
                      label: Text('Quotation → Won ${analyticsPercent(conversion.quotationToWonBps)}'),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                for (final widget in board.ordered) ...[
                  DashboardWidgetCard(
                    data: widget,
                    onTap: () => context.push(AppRoutes.analyticsMetricPath(widget.code)),
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
}
