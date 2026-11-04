import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../reports/presentation/report_metric_card.dart';
import '../application/warranty_providers.dart';
import '../domain/warranty.dart';

class WarrantyReportPage extends ConsumerStatefulWidget {
  const WarrantyReportPage({super.key});

  @override
  ConsumerState<WarrantyReportPage> createState() => _WarrantyReportPageState();
}

class _WarrantyReportPageState extends ConsumerState<WarrantyReportPage> {
  var _loading = true;
  String? _error;
  WarrantyReport? _report;

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
    final result = await ref.read(warrantyApiProvider).report();
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
      title: AppStrings.warrantyReport,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : report == null
          ? const SizedBox.shrink()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      ReportMetricCard(label: 'Total', value: report.total),
                      ReportMetricCard(label: 'Active', value: report.active),
                      ReportMetricCard(label: 'Expired', value: report.expired),
                      ReportMetricCard(label: 'Claimed', value: report.claimed),
                      ReportMetricCard(label: 'Void', value: report.voided),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}
