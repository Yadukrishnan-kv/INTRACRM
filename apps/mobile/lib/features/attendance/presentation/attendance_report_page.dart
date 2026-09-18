import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../application/attendance_providers.dart';
import '../domain/attendance.dart';

class AttendanceReportPage extends ConsumerStatefulWidget {
  const AttendanceReportPage({super.key});

  @override
  ConsumerState<AttendanceReportPage> createState() => _AttendanceReportPageState();
}

class _AttendanceReportPageState extends ConsumerState<AttendanceReportPage> {
  var _loading = true;
  String? _error;
  AttendanceReport? _report;

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
    final result = await ref.read(attendanceApiProvider).report();
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
      title: AppStrings.attendanceReport,
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
                  Text('${report.from} – ${report.to} · late after ${report.lateAfter}'),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      ReportMetricCard(label: 'Present days', value: report.presentDays),
                      ReportMetricCard(label: 'Late days', value: report.lateDays),
                      ReportMetricCard(label: 'Open now', value: report.openNow),
                      ReportMetricCard(label: 'Hours', valueLabel: report.hoursWorked.toStringAsFixed(1)),
                      ReportMetricCard(label: 'Staff', value: report.staffCount),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('By staff', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byStaff)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name ?? row.membershipId),
                      subtitle: Text(
                        'Present ${row.presentDays} · Late ${row.lateDays} · Open ${row.openNow} · ${formatMinutes(row.minutesWorked)}',
                      ),
                    ),
                  const SizedBox(height: AppSpacing.md),
                  Text('By day', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byDay)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.date),
                      subtitle: Text('Present ${row.present} · Late ${row.late} · Open ${row.open}'),
                    ),
                ],
              ),
            ),
    );
  }
}
