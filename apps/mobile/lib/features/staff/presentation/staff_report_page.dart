import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../../reports/presentation/report_ranked_section.dart';
import '../application/staff_providers.dart';
import '../domain/staff_models.dart';

class StaffReportPage extends ConsumerStatefulWidget {
  const StaffReportPage({super.key});

  @override
  ConsumerState<StaffReportPage> createState() => _StaffReportPageState();
}

class _StaffReportPageState extends ConsumerState<StaffReportPage> {
  var _loading = true;
  String? _error;
  StaffReport? _report;

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
    final result = unwrapApi<StaffReport>(
      await ref.read(staffApiProvider).staffReport(),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _report = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    return AppScaffold(
      title: AppStrings.staffReport,
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
                      ReportMetricCard(label: AppStrings.active, value: report.totals.active),
                      ReportMetricCard(label: AppStrings.inactive, value: report.totals.inactive),
                      ReportMetricCard(label: 'Invited', value: report.totals.invited),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  ReportRankedSection(
                    title: 'By role',
                    icon: Icons.shield_outlined,
                    items: rankedBy(
                      report.byRole,
                      label: (row) => row.name,
                      count: (row) => row.count,
                    ),
                  ),
                  ReportRankedSection(
                    title: 'By team',
                    icon: Icons.groups_outlined,
                    items: rankedBy(
                      [...report.byTeam.map((row) => (name: row.name, count: row.count)), (name: 'No team', count: report.unassignedTeam)],
                      label: (row) => row.name,
                      count: (row) => row.count,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text('Roster', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.roster)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.fullName),
                      subtitle: Text(
                        [
                          row.email,
                          row.active ? AppStrings.active : AppStrings.inactive,
                          row.roles.join(', '),
                          row.teams.join(', '),
                        ].whereType<String>().where((item) => item.isNotEmpty).join(' · '),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
