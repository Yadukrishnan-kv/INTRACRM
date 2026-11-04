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
import '../application/site_visit_providers.dart';
import '../domain/site_visit.dart';

class SiteVisitReportPage extends ConsumerStatefulWidget {
  const SiteVisitReportPage({super.key});

  @override
  ConsumerState<SiteVisitReportPage> createState() => _SiteVisitReportPageState();
}

class _SiteVisitReportPageState extends ConsumerState<SiteVisitReportPage> {
  ReportDateRange? _range;
  var _loading = true;
  String? _error;
  SiteVisitReport? _report;

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
    final result = await ref.read(siteVisitApiProvider).report(range: _range);
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
      title: AppStrings.siteVisitReport,
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
                            ReportMetricCard(label: 'Scheduled', value: report.totals.scheduled),
                            ReportMetricCard(label: 'In progress', value: report.totals.inProgress),
                            ReportMetricCard(label: 'Completed', value: report.totals.completed),
                            ReportMetricCard(label: 'No show', value: report.totals.noShow),
                            ReportMetricCard(label: 'With GPS', value: report.totals.withGps),
                            ReportMetricCard(label: 'With photos', value: report.totals.withPhotos),
                            ReportMetricCard(label: 'With feedback', value: report.totals.withFeedback),
                            ReportMetricCard(
                              label: 'Avg rating',
                              valueLabel: report.totals.averageRating?.toStringAsFixed(1) ?? '—',
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        ReportRankedSection(
                          title: 'By status',
                          icon: Icons.flag_outlined,
                          items: rankedBy(
                            report.byStatus,
                            label: (row) => SiteVisitStatuses.title(row.status),
                            count: (row) => row.count,
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By assignee',
                          icon: Icons.person_outline,
                          items: rankedBy(
                            report.byAssignee,
                            label: (row) => row.name ?? row.membershipId,
                            count: (row) => row.total,
                            subtitle: (row) => 'Completed ${row.completed} · GPS ${row.withGps} · no-show ${row.noShow}'
                                '${row.averageRating == null ? '' : ' · ${row.averageRating}★'}',
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
