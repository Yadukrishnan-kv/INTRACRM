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
import '../application/attendance_providers.dart';
import '../domain/attendance.dart';

class AttendanceReportPage extends ConsumerStatefulWidget {
  const AttendanceReportPage({super.key});

  @override
  ConsumerState<AttendanceReportPage> createState() => _AttendanceReportPageState();
}

class _AttendanceReportPageState extends ConsumerState<AttendanceReportPage> {
  ReportDateRange? _range;
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
    final result = await ref.read(attendanceApiProvider).report(range: _range);
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
                        ReportRankedSection(
                          title: 'By staff',
                          icon: Icons.badge_outlined,
                          items: rankedBy(
                            report.byStaff,
                            label: (row) => row.name ?? row.membershipId,
                            count: (row) => row.presentDays,
                            subtitle: (row) =>
                                'Late ${row.lateDays} · Open ${row.openNow} · ${formatMinutes(row.minutesWorked)}',
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By day',
                          icon: Icons.calendar_today_outlined,
                          items: rankedBy(
                            report.byDay,
                            label: (row) => row.date,
                            count: (row) => row.present,
                            subtitle: (row) => 'Late ${row.late} · Open ${row.open}',
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
