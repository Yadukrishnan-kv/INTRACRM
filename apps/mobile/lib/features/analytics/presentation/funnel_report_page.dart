import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../dashboard/presentation/widgets/dashboard_charts.dart';
import '../../reports/domain/report_date_range.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../../reports/presentation/report_export_button.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../application/analytics_providers.dart';
import '../domain/analytics.dart';
import '../domain/funnel_report.dart';
import 'widgets/funnel_report_charts.dart';

class FunnelReportPage extends ConsumerStatefulWidget {
  const FunnelReportPage({super.key, this.personal = false});

  final bool personal;

  @override
  ConsumerState<FunnelReportPage> createState() => _FunnelReportPageState();
}

class _FunnelReportPageState extends ConsumerState<FunnelReportPage> {
  FunnelReport? _report;
  var _loading = true;
  String? _error;

  /// Null covers every live lead; a range covers the leads created in it.
  ReportDateRange? _range;

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
    final api = ref.read(analyticsApiProvider);
    final result = widget.personal
        ? await api.mineFunnel(range: _range)
        : await api.funnel(range: _range);
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
      title: widget.personal ? AppStrings.staffFunnelReport : AppStrings.funnelReport,
      actions: widget.personal
          ? null
          : [ReportExportButton(dataset: 'funnel', range: _range, dateMode: ReportDateMode.ymd)],
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
          Expanded(child: _body(context, report)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, FunnelReport? report) {
    return _loading
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
                  Text(report.month.label, style: Theme.of(context).textTheme.titleMedium),
                  Text('Today ${report.today} · ${report.timezone}'),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      for (final stage in report.stages)
                        ReportMetricCard(label: stage.label, value: stage.reachedCount),
                      ReportMetricCard(
                        label: AppStrings.conversion,
                        valueLabel: analyticsPercent(report.conversion.overallBps),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(AppStrings.funnel, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  FunnelPyramidChart(stages: report.stages),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Conversion', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  FunnelConversionChart(slices: report.conversionChart),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Currently in stage', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  FunnelCurrentChart(slices: report.currentChart),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    _range == null ? 'Last 7 days' : 'Daily trend',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  FunnelTrendChart(points: report.trend, stages: report.stages),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Stage detail', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  for (final stage in report.stages) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(stage.label, style: Theme.of(context).textTheme.titleMedium),
                            Text(
                              'Reached ${stage.reachedCount} · Now ${stage.currentCount}'
                              '${stage.dropOffCount == null ? '' : ' · Drop-off ${stage.dropOffCount}'}'
                              ' · From previous ${stage.conversionLabel}',
                            ),
                            Text(
                              'Value ₹${(stage.reachedValueMinor / 100).toStringAsFixed(0)} reached · '
                              '₹${(stage.currentValueMinor / 100).toStringAsFixed(0)} current',
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            DashboardBarChart(
                              points: stage.series,
                              color: FunnelStageColors.of(stage.code),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                ],
              ),
            );
  }
}
