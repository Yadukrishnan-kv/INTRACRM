import 'package:flutter/material.dart';

import '../../../../design_system/tokens/app_spacing.dart';
import '../../domain/dashboard.dart';
import 'dashboard_charts.dart';

class DashboardWidgetCard extends StatelessWidget {
  const DashboardWidgetCard({super.key, required this.data, this.onTap});

  final DashboardWidget data;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final deltaColor = (data.deltaBps ?? 0) < 0 ? scheme.error : scheme.primary;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(data.title, style: Theme.of(context).textTheme.titleMedium),
                  ),
                  Text(
                    data.deltaText,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(color: deltaColor),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(data.primaryText, style: Theme.of(context).textTheme.headlineMedium),
              Text(data.primaryLabel, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: AppSpacing.md),
              DashboardBarChart(points: data.series),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final metric in data.metrics.take(3))
                    Chip(label: Text('${metric.label} ${metricDisplay(data, metric)}')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
