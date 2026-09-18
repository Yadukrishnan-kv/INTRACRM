import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../dashboard/presentation/widgets/dashboard_widget_card.dart';
import '../../reports/presentation/report_export_button.dart';
import '../application/analytics_providers.dart';
import '../domain/analytics.dart';
import 'widgets/funnel_chart.dart';

class AnalyticsPage extends ConsumerWidget {
  const AnalyticsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(analyticsOverviewProvider);
    return AppScaffold(
      title: AppStrings.analyticsDashboard,
      actions: const [ReportExportButton(dataset: 'analytics')],
      body: RefreshIndicator(
        onRefresh: () => ref.read(analyticsOverviewProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          isEmpty: (board) => board.ordered.isEmpty,
          emptyTitle: 'No analytics yet',
          emptyMessage: 'Leads, qualifications, quotations, and wins will appear here as work is logged.',
          builder: (board) => _AnalyticsBoard(
            board: board,
            onWidgetTap: (code) async {
              await context.push(AppRoutes.analyticsMetricPath(code));
              await ref.read(analyticsOverviewProvider.notifier).refresh();
            },
          ),
        ),
      ),
    );
  }
}

class _AnalyticsBoard extends StatelessWidget {
  const _AnalyticsBoard({required this.board, required this.onWidgetTap});

  final AnalyticsDashboard board;
  final Future<void> Function(String code) onWidgetTap;

  @override
  Widget build(BuildContext context) {
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
        const SizedBox(height: AppSpacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => context.push(AppRoutes.funnelReport),
            child: const Text(AppStrings.funnelReport),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            Chip(label: Text('Lead → Qualified ${analyticsPercent(conversion.leadToQualifiedBps)}')),
            Chip(label: Text('Qualified → Quotation ${analyticsPercent(conversion.qualifiedToQuotationBps)}')),
            Chip(label: Text('Quotation → Won ${analyticsPercent(conversion.quotationToWonBps)}')),
            Chip(label: Text('${AppStrings.conversion} ${analyticsPercent(conversion.overallBps)}')),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(AppStrings.analytics, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppSpacing.sm),
        for (final widget in board.ordered) ...[
          DashboardWidgetCard(
            data: widget,
            onTap: () => onWidgetTap(widget.code),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ],
    );
  }
}
