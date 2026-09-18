import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/target_providers.dart';
import '../domain/target.dart';

class TargetReportPage extends ConsumerStatefulWidget {
  const TargetReportPage({super.key});

  @override
  ConsumerState<TargetReportPage> createState() => _TargetReportPageState();
}

class _TargetReportPageState extends ConsumerState<TargetReportPage> {
  var _loading = true;
  String? _error;
  TargetReport? _report;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await ref.read(targetApiProvider).report();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _report = value.data;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    return AppScaffold(
      title: AppStrings.targetReport,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : report == null
          ? const SizedBox.shrink()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _MetricCard(label: 'Targets', value: report.count),
                      _MetricCard(label: 'On track', value: report.onTrack),
                      _MetricCard(label: 'Behind', value: report.behind),
                      _MetricCard(label: 'Hit', value: report.hit),
                      _MetricCard(label: 'Missed', value: report.missed),
                      _MetricCard(label: 'Ahead', value: report.ahead),
                      _MetricCard(label: 'At risk', value: report.atRisk),
                      _MetricCard(
                        label: 'Achievement',
                        valueLabel: report.averageAttainmentBps == null
                            ? '—'
                            : '${(report.averageAttainmentBps! / 100).toStringAsFixed(0)}%',
                      ),
                      _MetricCard(
                        label: 'Forecast',
                        valueLabel: report.averageForecastBps == null
                            ? '—'
                            : '${(report.averageForecastBps! / 100).toStringAsFixed(0)}%',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (report.byForecast.isNotEmpty) ...[
                    Text('Forecast', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.byForecast)
                      ListTile(
                        title: Text(TargetForecast.bandTitle(row['band'] as String?)),
                        trailing: Text('${row['count']}'),
                      ),
                  ],
                  Text('By period', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byPeriod)
                    ListTile(
                      title: Text(TargetKinds.title(row['periodType'] as String? ?? '')),
                      subtitle: Text('On track ${row['onTrack']} of ${row['count']}'),
                    ),
                  Text('By scope', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byScope)
                    ListTile(
                      title: Text(TargetKinds.title(row['scopeType'] as String? ?? '')),
                      subtitle: Text('On track ${row['onTrack']} of ${row['count']}'),
                    ),
                  Text('By metric', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byMetric)
                    ListTile(
                      title: Text(row['metricName'] as String? ?? row['metricCode'] as String? ?? ''),
                      subtitle: Text('${row['count']} targets'),
                    ),
                  if (report.teams.isNotEmpty) ...[
                    Text('Teams', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.teams)
                      ListTile(
                        title: Text(row['scopeName'] as String? ?? 'Team'),
                        subtitle: Text('On track ${row['onTrack']} of ${row['count']}'),
                      ),
                  ],
                  if (report.products.isNotEmpty) ...[
                    Text('Products', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.products)
                      ListTile(
                        title: Text(row['productName'] as String? ?? 'Product'),
                        subtitle: Text('On track ${row['onTrack']} of ${row['count']}'),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, this.value, this.valueLabel});

  final String label;
  final int? value;
  final String? valueLabel;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            Text(
              valueLabel ?? '${value ?? 0}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ],
        ),
      ),
    );
  }
}
