import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../follow_ups/application/follow_up_providers.dart';
import '../../follow_ups/domain/follow_up_report.dart';
import '../../leads/domain/lead.dart';
import 'report_export_button.dart';
import 'report_metric_card.dart';

class FollowUpReportPage extends ConsumerStatefulWidget {
  const FollowUpReportPage({super.key});

  @override
  ConsumerState<FollowUpReportPage> createState() => _FollowUpReportPageState();
}

class _FollowUpReportPageState extends ConsumerState<FollowUpReportPage> {
  var _loading = true;
  String? _error;
  FollowUpReport? _report;

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
    final result = await ref.read(followUpApiProvider).report();
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
      title: AppStrings.followUpReport,
      actions: const [ReportExportButton(dataset: 'follow-ups')],
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
                      ReportMetricCard(label: 'Total', value: report.totals.total),
                      ReportMetricCard(label: AppStrings.pending, value: report.totals.pending),
                      ReportMetricCard(label: AppStrings.completed, value: report.totals.completed),
                      ReportMetricCard(label: AppStrings.overdue, value: report.totals.overdue),
                      ReportMetricCard(label: AppStrings.today, value: report.totals.today),
                      ReportMetricCard(label: AppStrings.upcoming, value: report.totals.upcoming),
                      ReportMetricCard(label: 'Rescheduled', value: report.totals.rescheduled),
                      ReportMetricCard(
                        label: 'Completion',
                        valueLabel: reportPercent(report.totals.completionRateBps),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('By status', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byStatus)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(_statusTitle(row.status)),
                      trailing: Text('${row.count}'),
                    ),
                  Text('By type', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byType)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(FollowUpTypes.title(row.type)),
                      subtitle: Text('Completed ${row.completed}'),
                      trailing: Text('${row.count}'),
                    ),
                  Text('By assignee', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byAssignee)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name ?? row.membershipId),
                      subtitle: Text(
                        'Pending ${row.pending} · Done ${row.completed} · Overdue ${row.overdue}',
                      ),
                      trailing: Text('${row.total}'),
                    ),
                ],
              ),
            ),
    );
  }

  String _statusTitle(String status) {
    return switch (status) {
      'pending' => AppStrings.pending,
      'completed' => AppStrings.completed,
      'cancelled' => 'Cancelled',
      'skipped' => 'Skipped',
      _ => status,
    };
  }
}
