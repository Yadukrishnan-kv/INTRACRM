import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/domain/report_date_range.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../../reports/presentation/report_export_button.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../../reports/presentation/report_ranked_section.dart';
import '../data/tracks_api.dart';
import '../domain/track_report.dart';

final tracksApiProvider = Provider<TracksApi>((ref) {
  return TracksApi(ref.watch(apiClientProvider));
});

class TrackReportPage extends ConsumerStatefulWidget {
  const TrackReportPage({super.key});

  @override
  ConsumerState<TrackReportPage> createState() => _TrackReportPageState();
}

class _TrackReportPageState extends ConsumerState<TrackReportPage> {
  ReportDateRange? _range;
  var _loading = true;
  String? _error;
  TrackReport? _report;

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
    final result = await ref.read(tracksApiProvider).report(range: _range);
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
      title: AppStrings.trackReport,
      actions: [ReportExportButton(dataset: 'tracks', range: _range)],
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
                            ReportMetricCard(label: AppStrings.trackCreate, value: report.totals.create),
                            ReportMetricCard(label: AppStrings.trackUpdate, value: report.totals.update),
                            ReportMetricCard(label: AppStrings.trackDelete, value: report.totals.delete),
                            ReportMetricCard(
                              label: AppStrings.trackAssignments,
                              value: report.totals.assign,
                            ),
                            ReportMetricCard(
                              label: AppStrings.trackStatusChanges,
                              value: report.totals.statusChange,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        ReportRankedSection(
                          title: 'By action',
                          icon: Icons.bolt_outlined,
                          items: rankedBy(
                            report.byAction,
                            label: (row) => row.name,
                            count: (row) => row.count,
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By resource',
                          icon: Icons.inventory_2_outlined,
                          items: rankedBy(
                            report.byResource,
                            label: (row) => _resourceLabel(row.name),
                            count: (row) => row.count,
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By actor',
                          icon: Icons.person_outline,
                          emptyLabel: 'No tracked changes yet',
                          items: rankedBy(
                            report.byActor,
                            label: (row) => row.name ?? 'System',
                            count: (row) => row.count,
                          ),
                        ),
                        if (report.byDay.isNotEmpty)
                          ReportRankedSection(
                            title: 'By day',
                            icon: Icons.calendar_today_outlined,
                            items: rankedBy(
                              report.byDay,
                              label: (row) => row.date,
                              count: (row) => row.count,
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

  String _resourceLabel(String code) {
    switch (code) {
      case 'lead':
        return 'Lead';
      case 'quotation':
        return 'Quotation';
      case 'follow_up':
        return 'Follow-up';
      default:
        return code.replaceAll('_', ' ');
    }
  }
}
