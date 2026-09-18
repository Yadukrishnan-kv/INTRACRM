import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/pipeline_providers.dart';
import '../domain/pipeline_models.dart';

class PipelineAnalyticsPage extends ConsumerStatefulWidget {
  const PipelineAnalyticsPage({super.key});

  @override
  ConsumerState<PipelineAnalyticsPage> createState() => _PipelineAnalyticsPageState();
}

class _PipelineAnalyticsPageState extends ConsumerState<PipelineAnalyticsPage> {
  PipelineAnalytics? _report;
  var _loading = true;
  String? _error;

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
    final result = unwrapPipeline<PipelineAnalytics>(
      await ref.read(pipelineApiProvider).analytics(),
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
    final maxReached = report == null || report.stages.isEmpty
        ? 1
        : report.stages
              .map((stage) => stage.reachedCount)
              .fold<int>(1, (max, value) => value > max ? value : max);
    return AppScaffold(
      title: AppStrings.conversionAnalytics,
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
                  Text(report.pipelineName, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _Metric(label: 'Leads', value: '${report.leads}'),
                      _Metric(label: 'Open', value: '${report.open}'),
                      _Metric(label: 'Won', value: '${report.won}'),
                      _Metric(label: 'Lost', value: '${report.lost}'),
                      _Metric(label: 'Win rate', value: report.winRateLabel),
                      _Metric(label: 'Conversion', value: report.conversionLabel),
                      _Metric(
                        label: 'Pipeline value',
                        value: '₹${(report.pipelineValueMinor / 100).toStringAsFixed(0)}',
                      ),
                      _Metric(
                        label: 'Won value',
                        value: '₹${(report.wonValueMinor / 100).toStringAsFixed(0)}',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(AppStrings.funnel, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: AppSpacing.sm),
                  for (final stage in report.stages) ...[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(stage.name),
                      subtitle: Text(
                        'Now ${stage.currentCount} · Reached ${stage.reachedCount} · '
                        'From previous ${stage.conversionLabel}'
                        '${stage.dropOffCount == null ? '' : ' · Drop-off ${stage.dropOffCount}'}',
                      ),
                    ),
                    LinearProgressIndicator(
                      value: stage.reachedCount / maxReached,
                      minHeight: 8,
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                ],
              ),
            ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              Text(value, style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
        ),
      ),
    );
  }
}
