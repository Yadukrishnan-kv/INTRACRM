import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../dashboard/domain/dashboard.dart';
import '../../dashboard/presentation/widgets/dashboard_charts.dart';
import '../application/analytics_providers.dart';
import '../domain/analytics.dart';

class AnalyticsDetailPage extends ConsumerWidget {
  const AnalyticsDetailPage({super.key, required this.metricCode});

  final String metricCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(analyticsOverviewProvider);
    return AppScaffold(
      title: AnalyticsMetrics.title(metricCode),
      body: RefreshIndicator(
        onRefresh: () => ref.read(analyticsOverviewProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          isEmpty: (board) => board.widget(metricCode) == null,
          emptyTitle: 'Metric unavailable',
          emptyMessage: 'This analytics metric has no data for the current period.',
          builder: (board) {
            final data = board.widget(metricCode);
            if (data == null) {
              return const SizedBox.shrink();
            }
            return ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(board.month.label, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                Text(data.primaryText, style: Theme.of(context).textTheme.displaySmall),
                Text('${data.primaryLabel} · vs yesterday ${data.deltaText}'),
                const SizedBox(height: AppSpacing.lg),
                Text('Last 7 days', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                DashboardBarChart(points: data.series),
                const SizedBox(height: AppSpacing.lg),
                Text('Breakdown', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                DashboardMixChart(slices: data.mix),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    _MetricCard(label: data.primaryLabel, value: data.primaryText),
                    _MetricCard(
                      label: data.code == AnalyticsMetrics.conversion ? 'This month' : 'Month / total',
                      value: data.monthText,
                    ),
                    for (final metric in data.metrics)
                      _MetricCard(label: metric.label, value: metricDisplay(data, metric)),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                FilledButton.tonal(
                  onPressed: () => context.push(_relatedRoute(metricCode)),
                  child: Text(_relatedLabel(metricCode)),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  String _relatedRoute(String code) {
    return switch (code) {
      AnalyticsMetrics.leads => AppRoutes.leads,
      AnalyticsMetrics.qualified => AppRoutes.pipeline,
      AnalyticsMetrics.quotations => AppRoutes.quotations,
      AnalyticsMetrics.won => AppRoutes.salesReport,
      AnalyticsMetrics.conversion => AppRoutes.pipelineAnalytics,
      _ => AppRoutes.analytics,
    };
  }

  String _relatedLabel(String code) {
    return switch (code) {
      AnalyticsMetrics.leads => AppStrings.leads,
      AnalyticsMetrics.qualified => AppStrings.pipeline,
      AnalyticsMetrics.quotations => AppStrings.quotations,
      AnalyticsMetrics.won => AppStrings.salesReport,
      AnalyticsMetrics.conversion => AppStrings.conversionAnalytics,
      _ => AppStrings.analyticsDashboard,
    };
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}
