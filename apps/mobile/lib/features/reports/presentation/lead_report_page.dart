import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/application/lead_list_controller.dart';
import '../../leads/domain/lead_report.dart';
import '../../quotations/domain/quotation.dart';
import '../domain/report_date_range.dart';
import 'report_date_range_bar.dart';
import 'report_export_button.dart';
import 'report_metric_card.dart';

class LeadReportPage extends ConsumerStatefulWidget {
  const LeadReportPage({super.key});

  @override
  ConsumerState<LeadReportPage> createState() => _LeadReportPageState();
}

class _LeadReportPageState extends ConsumerState<LeadReportPage> {
  ReportDateRange? _range;
  var _loading = true;
  String? _error;
  LeadReport? _report;

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
    final result = await ref.read(leadApiProvider).report(range: _range);
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
    final user = ref.watch(authControllerProvider).user;
    return AppScaffold(
      title: AppStrings.leadReport,
      actions: [
        // GET /reports/leads/export needs lead:read AND lead:export.
        if (user?.canReadLead == true && user?.canExportLead == true)
          ReportExportButton(dataset: 'leads', range: _range),
      ],
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
                            ReportMetricCard(label: 'Total', value: report.totals.total),
                            ReportMetricCard(label: 'Open', value: report.totals.open),
                            ReportMetricCard(label: 'Won', value: report.totals.won),
                            ReportMetricCard(label: 'Lost', value: report.totals.lost),
                            ReportMetricCard(label: 'Unassigned', value: report.totals.unassigned),
                            ReportMetricCard(
                              label: 'Pipeline value',
                              valueLabel: minorToRupeesLabel(report.totals.estimatedValueMinor),
                            ),
                            ReportMetricCard(
                              label: 'Won value',
                              valueLabel: minorToRupeesLabel(report.totals.wonValueMinor),
                            ),
                            ReportMetricCard(
                              label: 'Win rate',
                              valueLabel: reportPercent(report.totals.winRateBps),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        Text('By lifecycle', style: Theme.of(context).textTheme.titleMedium),
                        for (final row in report.byLifecycle)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.title),
                            subtitle: Text(minorToRupeesLabel(row.valueMinor)),
                            trailing: Text('${row.count}'),
                          ),
                        Text('By quality', style: Theme.of(context).textTheme.titleMedium),
                        for (final row in report.byQuality)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.title),
                            trailing: Text('${row.count}'),
                          ),
                        Text('By source', style: Theme.of(context).textTheme.titleMedium),
                        for (final row in report.bySource)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.name ?? 'Unknown'),
                            subtitle: Text(minorToRupeesLabel(row.valueMinor)),
                            trailing: Text('${row.count}'),
                          ),
                        Text('By owner', style: Theme.of(context).textTheme.titleMedium),
                        for (final row in report.byOwner)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.name ?? 'Unassigned'),
                            subtitle: Text('Open ${row.open} · Won ${row.won} · Lost ${row.lost}'),
                            trailing: Text('${row.total}'),
                          ),
                        Text('By stage', style: Theme.of(context).textTheme.titleMedium),
                        for (final row in report.byStage)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.stageName),
                            trailing: Text('${row.count}'),
                          ),
                        if (report.byCity.isNotEmpty) ...[
                          Text('By city', style: Theme.of(context).textTheme.titleMedium),
                          for (final row in report.byCity)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(row.city),
                              trailing: Text('${row.count}'),
                            ),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
