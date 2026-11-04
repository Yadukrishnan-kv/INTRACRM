import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/application/lead_list_controller.dart';
import '../../leads/domain/lead_list_filter.dart';
import '../../leads/domain/lead_report.dart';
import '../../quotations/domain/quotation.dart';
import '../domain/report_date_range.dart';
import 'report_date_range_bar.dart';
import 'report_export_button.dart';
import 'report_metric_card.dart';
import 'report_ranked_section.dart';

class LeadReportPage extends ConsumerStatefulWidget {
  const LeadReportPage({super.key});

  @override
  ConsumerState<LeadReportPage> createState() => _LeadReportPageState();
}

class _LeadReportPageState extends ConsumerState<LeadReportPage> {
  ReportDateRange? _range;
  var _loading = true;
  String? _error;
  LeadReport? _report;

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
    final result = await ref.read(leadApiProvider).report(range: _range);
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

  void _openLeads(Object payload) {
    context.push(AppRoutes.leads, extra: payload as LeadListFilter);
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    final user = ref.watch(authControllerProvider).user;
    return AppScaffold(
      title: AppStrings.leadReport,
      actions: [
        // GET /reports/leads/export needs lead:read AND lead:export.
        if (user?.canReadLead == true && user?.canExportLead == true)
          ReportExportButton(dataset: 'leads', range: _range),
      ],
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
                            ReportMetricCard(label: 'Open', value: report.totals.open),
                            ReportMetricCard(label: 'Won', value: report.totals.won),
                            ReportMetricCard(label: 'Lost', value: report.totals.lost),
                            ReportMetricCard(label: 'Unassigned', value: report.totals.unassigned),
                            ReportMetricCard(
                              label: 'Pipeline value',
                              valueLabel: minorToRupeesLabel(report.totals.estimatedValueMinor),
                            ),
                            ReportMetricCard(
                              label: 'Won value',
                              valueLabel: minorToRupeesLabel(report.totals.wonValueMinor),
                            ),
                            ReportMetricCard(
                              label: 'Win rate',
                              valueLabel: reportPercent(report.totals.winRateBps),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        ReportRankedSection(
                          title: 'By lifecycle',
                          icon: Icons.timeline_outlined,
                          onItemTap: _openLeads,
                          items: rankedBy(
                            report.byLifecycle,
                            label: (row) => row.title,
                            count: (row) => row.count,
                            valueLabel: (row) => minorToRupeesLabel(row.valueMinor),
                            payload: (row) => LeadListFilter(label: row.title, status: row.status),
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By quality',
                          icon: Icons.star_outline,
                          onItemTap: _openLeads,
                          items: rankedBy(
                            report.byQuality,
                            label: (row) => row.title,
                            count: (row) => row.count,
                            payload: (row) => LeadListFilter(label: row.title, quality: row.quality),
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By source',
                          icon: Icons.share_outlined,
                          onItemTap: _openLeads,
                          items: rankedBy(
                            report.bySource,
                            label: (row) => row.name ?? 'Unknown',
                            count: (row) => row.count,
                            valueLabel: (row) => minorToRupeesLabel(row.valueMinor),
                            payload: (row) => row.sourceId != null
                                ? LeadListFilter(label: row.name ?? 'Unknown', sourceId: row.sourceId)
                                : const LeadListFilter(label: 'Unknown source', matchUnknownSource: true),
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By owner',
                          icon: Icons.person_outline,
                          onItemTap: _openLeads,
                          items: rankedBy(
                            report.byOwner,
                            label: (row) => row.name ?? 'Unassigned',
                            count: (row) => row.total,
                            valueLabel: (row) => minorToRupeesLabel(row.valueMinor),
                            subtitle: (row) => 'Open ${row.open} · Won ${row.won} · Lost ${row.lost}',
                            payload: (row) => row.membershipId != null
                                ? LeadListFilter(label: row.name ?? 'Unassigned', ownerMembershipId: row.membershipId)
                                : const LeadListFilter(label: 'Unassigned', matchUnassignedOwner: true),
                          ),
                        ),
                        ReportRankedSection(
                          title: 'By stage',
                          icon: Icons.stacked_bar_chart_outlined,
                          onItemTap: _openLeads,
                          items: rankedBy(
                            report.byStage,
                            label: (row) => row.stageName,
                            count: (row) => row.count,
                            valueLabel: (row) => minorToRupeesLabel(row.valueMinor),
                            payload: (row) => LeadListFilter(label: row.stageName, stageName: row.stageName),
                          ),
                        ),
                        if (report.byCity.isNotEmpty)
                          ReportRankedSection(
                            title: 'By city',
                            icon: Icons.location_city_outlined,
                            onItemTap: _openLeads,
                            items: rankedBy(
                              report.byCity,
                              label: (row) => row.city,
                              count: (row) => row.count,
                              payload: (row) => LeadListFilter(label: row.city, city: row.city),
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
