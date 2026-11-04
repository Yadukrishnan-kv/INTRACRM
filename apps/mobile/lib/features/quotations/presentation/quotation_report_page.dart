import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/domain/report_date_range.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../../reports/presentation/report_export_button.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../../reports/presentation/report_ranked_section.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';

class QuotationReportPage extends ConsumerStatefulWidget {
  const QuotationReportPage({super.key});

  @override
  ConsumerState<QuotationReportPage> createState() => _QuotationReportPageState();
}

class _QuotationReportPageState extends ConsumerState<QuotationReportPage> {
  ReportDateRange? _range;
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
    final result = await ref.read(quotationApiProvider).report(range: _range);
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
      actions: [ReportExportButton(dataset: 'quotations', range: _range)],
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
                            ReportMetricCard(label: 'Draft', value: report.totals.draft),
                            ReportMetricCard(label: 'Sent', value: report.totals.sent),
                            ReportMetricCard(label: 'Follow-up', value: report.totals.followUp),
                            ReportMetricCard(label: 'Deciding', value: report.totals.customerDeciding),
                            ReportMetricCard(label: 'Negotiation', value: report.totals.negotiation),
                            ReportMetricCard(label: 'Approved', value: report.totals.approved),
                            ReportMetricCard(label: 'Won', value: report.totals.won),
                            ReportMetricCard(label: 'Lost', value: report.totals.lost),
                            ReportMetricCard(
                              label: 'Open value',
                              valueLabel: minorToRupeesLabel(report.totals.openValueMinor),
                            ),
                            ReportMetricCard(
                              label: 'Won value',
                              valueLabel: minorToRupeesLabel(report.totals.wonValueMinor),
                            ),
                            ReportMetricCard(label: 'Win rate', valueLabel: report.totals.winRateLabel),
                            ReportMetricCard(label: 'Pending', value: report.totals.pending),
                            ReportMetricCard(
                              label: 'Pending value',
                              valueLabel: minorToRupeesLabel(report.totals.pendingValueMinor),
                            ),
                            ReportMetricCard(label: 'Overdue reminders', value: report.totals.overdueReminders),
                            ReportMetricCard(label: 'Closing soon', value: report.totals.closingSoon),
                            ReportMetricCard(label: 'Closing overdue', value: report.totals.closingOverdue),
                            ReportMetricCard(label: 'No reminder', value: report.totals.noFollowUp),
                            ReportMetricCard(
                              label: 'Avg close chance',
                              valueLabel: report.totals.averagePredictionLabel,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        ReportRankedSection(
                          title: 'By status',
                          icon: Icons.flag_outlined,
                          items: rankedBy(
                            report.byStatus,
                            label: (row) => QuotationStatuses.title(row.status),
                            count: (row) => row.count,
                            valueLabel: (row) => minorToRupeesLabel(row.valueMinor),
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By assignee',
                          icon: Icons.person_outline,
                          items: rankedBy(
                            report.byAssignee,
                            label: (row) => row.name ?? row.membershipId ?? 'Unassigned',
                            count: (row) => row.total,
                            valueLabel: (row) => minorToRupeesLabel(row.wonValueMinor),
                            subtitle: (row) => 'Won ${row.won} · Lost ${row.lost}',
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
