import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';
import '../../reports/presentation/report_export_button.dart';

class QuotationReportPage extends ConsumerStatefulWidget {
  const QuotationReportPage({super.key});

  @override
  ConsumerState<QuotationReportPage> createState() => _QuotationReportPageState();
}

class _QuotationReportPageState extends ConsumerState<QuotationReportPage> {
  var _loading = true;
  String? _error;
  QuotationReport? _report;

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
    final result = await ref.read(quotationApiProvider).report();
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
      title: AppStrings.quotationReport,
      actions: const [ReportExportButton(dataset: 'quotations')],
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
                      _MetricCard(label: 'Total', value: report.totals.total),
                      _MetricCard(label: 'Draft', value: report.totals.draft),
                      _MetricCard(label: 'Sent', value: report.totals.sent),
                      _MetricCard(label: 'Follow-up', value: report.totals.followUp),
                      _MetricCard(label: 'Deciding', value: report.totals.customerDeciding),
                      _MetricCard(label: 'Negotiation', value: report.totals.negotiation),
                      _MetricCard(label: 'Approved', value: report.totals.approved),
                      _MetricCard(label: 'Won', value: report.totals.won),
                      _MetricCard(label: 'Lost', value: report.totals.lost),
                      _MetricCard(
                        label: 'Open value',
                        valueLabel: minorToRupeesLabel(report.totals.openValueMinor),
                      ),
                      _MetricCard(
                        label: 'Won value',
                        valueLabel: minorToRupeesLabel(report.totals.wonValueMinor),
                      ),
                      _MetricCard(label: 'Win rate', valueLabel: report.totals.winRateLabel),
                      _MetricCard(label: 'Pending', value: report.totals.pending),
                      _MetricCard(
                        label: 'Pending value',
                        valueLabel: minorToRupeesLabel(report.totals.pendingValueMinor),
                      ),
                      _MetricCard(label: 'Overdue reminders', value: report.totals.overdueReminders),
                      _MetricCard(label: 'Closing soon', value: report.totals.closingSoon),
                      _MetricCard(label: 'Closing overdue', value: report.totals.closingOverdue),
                      _MetricCard(label: 'No reminder', value: report.totals.noFollowUp),
                      _MetricCard(
                        label: 'Avg close chance',
                        valueLabel: report.totals.averagePredictionLabel,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('By status', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byStatus)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(QuotationStatuses.title(row.status)),
                      subtitle: Text(minorToRupeesLabel(row.valueMinor)),
                      trailing: Text('${row.count}'),
                    ),
                  const SizedBox(height: AppSpacing.md),
                  Text('By assignee', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byAssignee)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name ?? row.membershipId ?? 'Unassigned'),
                      subtitle: Text(
                        'Won ${row.won} · Lost ${row.lost} · ${minorToRupeesLabel(row.wonValueMinor)}',
                      ),
                      trailing: Text('${row.total}'),
                    ),
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
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                valueLabel ?? '${value ?? 0}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(label),
            ],
          ),
        ),
      ),
    );
  }
}
