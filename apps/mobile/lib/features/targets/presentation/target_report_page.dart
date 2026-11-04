import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/domain/report_date_range.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../../reports/presentation/report_ranked_section.dart';
import '../application/target_providers.dart';
import '../domain/target.dart';

class TargetReportPage extends ConsumerStatefulWidget {
  const TargetReportPage({super.key});

  @override
  ConsumerState<TargetReportPage> createState() => _TargetReportPageState();
}

class _TargetReportPageState extends ConsumerState<TargetReportPage> {
  ReportDateRange? _range;
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
    final result = await ref.read(targetApiProvider).report(range: _range);
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
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
            child: ReportDateRangeBar(
              range: _range,
              onChanged: (range) {
                setState(() => _range = range);
                _load();
              },
            ),
          ),
          Expanded(
            child: _loading
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
                            ReportMetricCard(label: 'Targets', value: report.count),
                            ReportMetricCard(label: 'On track', value: report.onTrack),
                            ReportMetricCard(label: 'Behind', value: report.behind),
                            ReportMetricCard(label: 'Hit', value: report.hit),
                            ReportMetricCard(label: 'Missed', value: report.missed),
                            ReportMetricCard(label: 'Ahead', value: report.ahead),
                            ReportMetricCard(label: 'At risk', value: report.atRisk),
                            ReportMetricCard(
                              label: 'Achievement',
                              valueLabel: report.averageAttainmentBps == null
                                  ? '—'
                                  : '${(report.averageAttainmentBps! / 100).toStringAsFixed(0)}%',
                            ),
                            ReportMetricCard(
                              label: 'Forecast',
                              valueLabel: report.averageForecastBps == null
                                  ? '—'
                                  : '${(report.averageForecastBps! / 100).toStringAsFixed(0)}%',
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        if (report.byForecast.isNotEmpty)
                          ReportRankedSection(
                            title: 'Forecast',
                            icon: Icons.insights_outlined,
                            items: rankedBy(
                              report.byForecast,
                              label: (row) => TargetForecast.bandTitle(row['band'] as String?),
                              count: (row) => row['count'] as int? ?? 0,
                            ),
                          ),
                        ReportRankedSection(
                          title: 'By period',
                          icon: Icons.calendar_month_outlined,
                          items: rankedBy(
                            report.byPeriod,
                            label: (row) => TargetKinds.title(row['periodType'] as String? ?? ''),
                            count: (row) => row['count'] as int? ?? 0,
                            subtitle: (row) => 'On track ${row['onTrack']}',
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By scope',
                          icon: Icons.layers_outlined,
                          items: rankedBy(
                            report.byScope,
                            label: (row) => TargetKinds.title(row['scopeType'] as String? ?? ''),
                            count: (row) => row['count'] as int? ?? 0,
                            subtitle: (row) => 'On track ${row['onTrack']}',
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By metric',
                          icon: Icons.speed_outlined,
                          items: rankedBy(
                            report.byMetric,
                            label: (row) => row['metricName'] as String? ?? row['metricCode'] as String? ?? '',
                            count: (row) => row['count'] as int? ?? 0,
                          ),
                        ),
                        if (report.teams.isNotEmpty)
                          ReportRankedSection(
                            title: 'Teams',
                            icon: Icons.groups_outlined,
                            items: rankedBy(
                              report.teams,
                              label: (row) => row['scopeName'] as String? ?? 'Team',
                              count: (row) => row['count'] as int? ?? 0,
                              subtitle: (row) => 'On track ${row['onTrack']}',
                            ),
                          ),
                        if (report.products.isNotEmpty)
                          ReportRankedSection(
                            title: 'Products',
                            icon: Icons.inventory_2_outlined,
                            items: rankedBy(
                              report.products,
                              label: (row) => row['productName'] as String? ?? 'Product',
                              count: (row) => row['count'] as int? ?? 0,
                              subtitle: (row) => 'On track ${row['onTrack']}',
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

