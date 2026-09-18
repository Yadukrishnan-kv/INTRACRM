import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../quotations/application/quotation_providers.dart';
import '../../quotations/domain/quotation.dart';
import '../../quotations/domain/sales_report.dart';
import 'report_export_button.dart';
import 'report_metric_card.dart';

class SalesReportPage extends ConsumerStatefulWidget {
  const SalesReportPage({super.key});

  @override
  ConsumerState<SalesReportPage> createState() => _SalesReportPageState();
}

class _SalesReportPageState extends ConsumerState<SalesReportPage> {
  var _loading = true;
  String? _error;
  SalesReport? _report;

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
    final result = await ref.read(quotationApiProvider).salesReport();
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
      title: AppStrings.salesReport,
      actions: const [ReportExportButton(dataset: 'sales')],
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
                      ReportMetricCard(label: 'Deals won', value: report.totals.deals),
                      ReportMetricCard(
                        label: 'Revenue',
                        valueLabel: minorToRupeesLabel(report.totals.revenueMinor),
                      ),
                      ReportMetricCard(
                        label: 'Average deal',
                        valueLabel: report.totals.averageDealMinor == null
                            ? '—'
                            : minorToRupeesLabel(report.totals.averageDealMinor!),
                      ),
                      ReportMetricCard(label: 'Lost deals', value: report.totals.lostDeals),
                      ReportMetricCard(
                        label: 'Lost value',
                        valueLabel: minorToRupeesLabel(report.totals.lostValueMinor),
                      ),
                      ReportMetricCard(
                        label: 'Win rate',
                        valueLabel: reportPercent(report.totals.winRateBps),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('By salesperson', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byAssignee)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name ?? 'Unassigned'),
                      subtitle: Text(
                        'Won ${row.deals} · Lost ${row.lostDeals} · ${minorToRupeesLabel(row.revenueMinor)}',
                      ),
                      trailing: Text(minorToRupeesLabel(row.revenueMinor)),
                    ),
                  if (report.byMonth.isNotEmpty) ...[
                    Text('By month', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.byMonth)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(row.month),
                        subtitle: Text('${row.deals} deals'),
                        trailing: Text(minorToRupeesLabel(row.revenueMinor)),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
