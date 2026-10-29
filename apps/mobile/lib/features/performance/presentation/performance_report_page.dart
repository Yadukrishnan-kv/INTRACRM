import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/domain/report_date_range.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../../reports/presentation/report_export_button.dart';
import '../application/performance_providers.dart';
import '../domain/performance.dart';

class PerformanceReportPage extends ConsumerStatefulWidget {
  const PerformanceReportPage({super.key});

  @override
  ConsumerState<PerformanceReportPage> createState() => _PerformanceReportPageState();
}

class _PerformanceReportPageState extends ConsumerState<PerformanceReportPage> {
  var _loading = true;
  String? _error;
  PerformanceReport? _report;
  var _periodType = 'monthly';

  /// A custom range replaces the period chips; the API ignores periodType then.
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
    final result = await ref
        .read(performanceApiProvider)
        .report(periodType: _periodType, range: _range);
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
      title: AppStrings.performanceReport,
      actions: [
        ReportExportButton(
          dataset: 'performance',
          periodType: _range == null ? _periodType : null,
          range: _range,
          dateMode: ReportDateMode.ymd,
        ),
      ],
      // The range bar sits outside the loading/error states so a rejected
      // range can still be changed or cleared.
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

  Widget _body(BuildContext context, PerformanceReport? report) {
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
                  if (_range == null)
                    Wrap(
                      spacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('Monthly'),
                          selected: _periodType == 'monthly',
                          onSelected: (_) {
                            setState(() => _periodType = 'monthly');
                            _load();
                          },
                        ),
                        ChoiceChip(
                          label: const Text('Daily'),
                          selected: _periodType == 'daily',
                          onSelected: (_) {
                            setState(() => _periodType = 'daily');
                            _load();
                          },
                        ),
                      ],
                    ),
                  const SizedBox(height: AppSpacing.md),
                  Text(report.period.label, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _MetricCard(label: 'Staff', value: report.staff),
                      _MetricCard(label: 'Scored', value: report.scored),
                      _MetricCard(
                        label: 'Average',
                        valueLabel: bpsLabel(report.averageScoreBps),
                      ),
                      _MetricCard(label: 'Outstanding', value: report.outstanding),
                      _MetricCard(label: 'Strong', value: report.strong),
                      _MetricCard(label: 'Needs work', value: report.needsWork),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(AppStrings.leaderboard, style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.top)
                    ListTile(
                      leading: Text(row.rankLabel),
                      title: Text(row.name),
                      subtitle: Text('${row.scoreLabel} · ${row.bandLabel}'),
                    ),
                  if (report.byTeam.isNotEmpty) ...[
                    Text('Teams', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.byTeam)
                      ListTile(
                        title: Text(row.teamName),
                        subtitle: Text(
                          '${row.count} staff · ${bpsLabel(row.averageScoreBps)} avg',
                        ),
                      ),
                  ],
                ],
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
