import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/dashboard_providers.dart';
import '../domain/dashboard.dart';

class DashboardDetailPage extends ConsumerWidget {
  const DashboardDetailPage({super.key, required this.widgetCode});

  final String widgetCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(dashboardOverviewProvider);
    final isSales = widgetCode == DashboardWidgets.sales;
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(title: Text(isSales ? 'MTD Performance' : DashboardWidgets.title(widgetCode))),
      body: RefreshIndicator(
        onRefresh: () => ref.read(dashboardOverviewProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          isEmpty: (board) => board.widget(widgetCode) == null,
          emptyTitle: 'Widget unavailable',
          emptyMessage: 'This dashboard widget has no data for the current period.',
          builder: (board) {
            final data = board.widget(widgetCode);
            if (data == null) {
              return const SizedBox.shrink();
            }
            final target = _metric(data, 'target');
            final achieved = data.month;
            final progress = target <= 0 ? 0.0 : (achieved / target).clamp(0.0, 1.0);
            final workingDays = _metric(data, 'working_days', fallback: _workingDays(board.month));
            final remaining = _metric(data, 'days_remaining', fallback: _daysRemaining(board.month, board.today));
            final requiredDaily = remaining <= 0
                ? 0
                : ((target - achieved).clamp(0, target) / remaining).round();
            final mixTotal = data.mix.fold<int>(0, (sum, slice) => sum + slice.value);
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                Text(
                  board.month.label,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: AppSpacing.md),
                SectionCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Target', style: TextStyle(color: AppColors.muted)),
                            Text(
                              formatDashboardValue(target, money: data.isMoney, score: data.isScore),
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 10),
                            const Text('Achievement', style: TextStyle(color: AppColors.muted)),
                            Text(
                              formatDashboardValue(achieved, money: data.isMoney, score: data.isScore),
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ),
                      AppDonut(progress: progress, caption: 'Achievement'),
                    ],
                  ),
                ),
                if (isSales) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: StatTile(icon: Icons.event_available_outlined, label: 'Working Days', value: '$workingDays')),
                      const SizedBox(width: 10),
                      Expanded(child: StatTile(icon: Icons.hourglass_bottom_outlined, label: 'Days Remaining', value: '$remaining')),
                    ],
                  ),
                  const SizedBox(height: 10),
                  StatTile(
                    icon: Icons.trending_up,
                    label: 'Required Daily Sales',
                    value: formatDashboardValue(requiredDaily, money: true, score: false),
                  ),
                ],
                if (data.mix.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isSales ? 'Category-wise Performance' : 'Breakdown',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 12),
                        for (final slice in data.mix) ...[
                          Row(
                            children: [
                              Expanded(
                                child: Text(slice.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                              ),
                              Text(
                                formatDashboardValue(slice.value, money: data.isMoney, score: data.isScore),
                                style: const TextStyle(fontSize: 12, color: AppColors.muted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: LinearProgressIndicator(
                                  value: mixTotal <= 0 ? 0 : (slice.value / mixTotal).clamp(0.0, 1.0),
                                  minHeight: 8,
                                  borderRadius: BorderRadius.circular(99),
                                  color: AppColors.teal,
                                  backgroundColor: AppColors.tealSoft,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                mixTotal <= 0 ? '0%' : '${((slice.value / mixTotal) * 100).toStringAsFixed(0)}%',
                                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.teal),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],
                    ),
                  ),
                ],
                if (!isSales) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      SizedBox(
                        width: 160,
                        child: StatTile(icon: Icons.today_outlined, label: data.primaryLabel, value: data.primaryText),
                      ),
                      for (final metric in data.metrics)
                        SizedBox(
                          width: 160,
                          child: StatTile(
                            icon: Icons.analytics_outlined,
                            label: metric.label,
                            value: metricDisplay(data, metric),
                          ),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                FilledButton.tonal(
                  onPressed: () => context.push(_relatedRoute(widgetCode)),
                  child: Text(_relatedLabel(widgetCode)),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  int _metric(DashboardWidget data, String code, {int? fallback}) {
    for (final metric in data.metrics) {
      if (metric.code == code) {
        return metric.value;
      }
    }
    return fallback ?? 0;
  }

  int _workingDays(DashboardPeriod month) {
    final start = DateTime.tryParse(month.start);
    final end = DateTime.tryParse(month.end);
    if (start == null || end == null) {
      return 26;
    }
    var days = 0;
    for (var day = start; !day.isAfter(end); day = day.add(const Duration(days: 1))) {
      if (day.weekday != DateTime.sunday) {
        days += 1;
      }
    }
    return days;
  }

  int _daysRemaining(DashboardPeriod month, String todayYmd) {
    final end = DateTime.tryParse(month.end);
    final today = DateTime.tryParse(todayYmd) ?? DateTime.now();
    if (end == null) {
      return 0;
    }
    var days = 0;
    for (var day = today; !day.isAfter(end); day = day.add(const Duration(days: 1))) {
      if (day.weekday != DateTime.sunday) {
        days += 1;
      }
    }
    return days;
  }

  String _relatedRoute(String code) {
    return switch (code) {
      DashboardWidgets.leads => AppRoutes.leads,
      DashboardWidgets.followUps => AppRoutes.tasks,
      DashboardWidgets.quotations => AppRoutes.quotations,
      DashboardWidgets.orders => AppRoutes.quotationReport,
      DashboardWidgets.sales => AppRoutes.performance,
      DashboardWidgets.staffPerformance => AppRoutes.performance,
      _ => AppRoutes.dashboard,
    };
  }

  String _relatedLabel(String code) {
    return switch (code) {
      DashboardWidgets.leads => AppStrings.leads,
      DashboardWidgets.followUps => AppStrings.followUps,
      DashboardWidgets.quotations => AppStrings.quotations,
      DashboardWidgets.orders => AppStrings.quotationReport,
      DashboardWidgets.sales => 'Target & Achievement',
      DashboardWidgets.staffPerformance => AppStrings.staffPerformance,
      _ => AppStrings.founderDashboard,
    };
  }
}
