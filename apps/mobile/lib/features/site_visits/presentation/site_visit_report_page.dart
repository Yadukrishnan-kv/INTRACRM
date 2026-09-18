import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/site_visit_providers.dart';
import '../domain/site_visit.dart';

class SiteVisitReportPage extends ConsumerStatefulWidget {
  const SiteVisitReportPage({super.key});

  @override
  ConsumerState<SiteVisitReportPage> createState() => _SiteVisitReportPageState();
}

class _SiteVisitReportPageState extends ConsumerState<SiteVisitReportPage> {
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
    final result = await ref.read(siteVisitApiProvider).report();
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
                      _MetricCard(label: 'Scheduled', value: report.totals.scheduled),
                      _MetricCard(label: 'In progress', value: report.totals.inProgress),
                      _MetricCard(label: 'Completed', value: report.totals.completed),
                      _MetricCard(label: 'No show', value: report.totals.noShow),
                      _MetricCard(label: 'With GPS', value: report.totals.withGps),
                      _MetricCard(label: 'With photos', value: report.totals.withPhotos),
                      _MetricCard(label: 'With feedback', value: report.totals.withFeedback),
                      _MetricCard(
                        label: 'Avg rating',
                        valueLabel: report.totals.averageRating?.toStringAsFixed(1) ?? '—',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('By status', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byStatus)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(SiteVisitStatuses.title(row.status)),
                      trailing: Text('${row.count}'),
                    ),
                  const SizedBox(height: AppSpacing.md),
                  Text('By assignee', style: Theme.of(context).textTheme.titleMedium),
                  for (final row in report.byAssignee)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.name ?? row.membershipId),
                      subtitle: Text(
                        'Completed ${row.completed} · GPS ${row.withGps} · no-show ${row.noShow}'
                        '${row.averageRating == null ? '' : ' · ${row.averageRating}★'}',
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
