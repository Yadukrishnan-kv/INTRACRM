import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/presentation/report_export_button.dart';
import '../../reports/presentation/report_metric_card.dart';
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
    final result = await ref.read(tracksApiProvider).report();
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
      actions: const [ReportExportButton(dataset: 'tracks')],
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
                  Text('By action', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byAction)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name),
                      trailing: Text('${row.count}'),
                    ),
                  Text('By resource', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byResource)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(_resourceLabel(row.name)),
                      trailing: Text('${row.count}'),
                    ),
                  Text('By actor', style: Theme.of(context).textTheme.titleMedium),
                  if (report.byActor.isEmpty)
                    const ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('No tracked changes yet'),
                    )
                  else
                    for (final row in report.byActor)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(row.name ?? 'System'),
                        trailing: Text('${row.count}'),
                      ),
                  if (report.byDay.isNotEmpty) ...[
                    Text('By day', style: Theme.of(context).textTheme.titleMedium),
                    for (final row in report.byDay)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(row.date),
                        trailing: Text('${row.count}'),
                      ),
                  ],
                ],
              ),
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
