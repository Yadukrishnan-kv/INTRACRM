import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/performance_providers.dart';
import '../domain/performance.dart';

class PerformanceDetailPage extends ConsumerStatefulWidget {
  const PerformanceDetailPage({super.key, required this.membershipId});

  final String membershipId;

  @override
  ConsumerState<PerformanceDetailPage> createState() => _PerformanceDetailPageState();
}

class _PerformanceDetailPageState extends ConsumerState<PerformanceDetailPage> {
  PerformanceCard? _card;
  Failure? _failure;
  var _loading = true;
  var _periodType = 'monthly';

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    final result = await ref.read(performanceApiProvider).getById(
      widget.membershipId,
      periodType: _periodType,
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _card = value.data;
        case Err(:final failure):
          _failure = failure;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final card = _card;
    final item = card?.staff;
    return AppScaffold(
      title: AppStrings.performanceScore,
      body: _loading
          ? const AppLoading()
          : _failure != null
          ? AppErrorView(failure: _failure!, onRetry: _reload)
          : item == null
          ? const SizedBox.shrink()
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('Monthly'),
                        selected: _periodType == 'monthly',
                        onSelected: (_) {
                          setState(() => _periodType = 'monthly');
                          _reload();
                        },
                      ),
                      ChoiceChip(
                        label: const Text('Daily'),
                        selected: _periodType == 'daily',
                        onSelected: (_) {
                          setState(() => _periodType = 'daily');
                          _reload();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(item.name, style: Theme.of(context).textTheme.headlineSmall),
                  Text('${card!.period.label} · ${item.bandLabel}'),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _StatCard(label: AppStrings.performanceScore, value: item.scoreLabel),
                      _StatCard(label: AppStrings.rank, value: '${item.rankLabel} of ${item.rankedOutOf}'),
                      _StatCard(
                        label: AppStrings.teamRank,
                        value: item.teamRank == null ? '—' : '#${item.teamRank}',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('KPIs', style: Theme.of(context).textTheme.titleMedium),
                  _KpiTile(
                    title: AppStrings.leadConversion,
                    value: bpsLabel(item.leadConversionBps),
                    detail: '${item.leadsWon} won · ${item.leadsLost} lost · ${item.leadsCreated} created',
                    bps: item.leadConversionBps,
                  ),
                  _KpiTile(
                    title: AppStrings.followUpCompletion,
                    value: bpsLabel(item.followUpCompletionBps),
                    detail: '${item.followUpsCompleted} completed of ${item.followUpsDue} due',
                    bps: item.followUpCompletionBps,
                  ),
                  _KpiTile(
                    title: AppStrings.salesAchievement,
                    value: bpsLabel(item.salesAchievementBps),
                    detail: item.salesTargetMinor == null
                        ? 'No membership revenue target this period'
                        : '₹${(item.revenueMinor / 100).toStringAsFixed(0)} of ₹${(item.salesTargetMinor! / 100).toStringAsFixed(0)}',
                    bps: item.salesAchievementBps,
                  ),
                  _KpiTile(
                    title: AppStrings.quotationConversion,
                    value: bpsLabel(item.quotationConversionBps),
                    detail: '${item.quotationsWon} won · ${item.quotationsLost} lost · ${item.quotationsSent} sent',
                    bps: item.quotationConversionBps,
                  ),
                  if (card.neighbors.length > 1) ...[
                    const SizedBox(height: AppSpacing.md),
                    Text('Nearby ranks', style: Theme.of(context).textTheme.titleMedium),
                    for (final neighbor in card.neighbors)
                      ListTile(
                        selected: neighbor.membershipId == item.membershipId,
                        title: Text('${neighbor.rankLabel}  ${neighbor.name}'),
                        trailing: Text(neighbor.scoreLabel),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.title,
    required this.value,
    required this.detail,
    required this.bps,
  });

  final String title;
  final String value;
  final String detail;
  final int? bps;

  @override
  Widget build(BuildContext context) {
    final fraction = ((bps ?? 0).clamp(0, 10000)) / 10000;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(title),
            subtitle: Text(detail),
            trailing: Text(value, style: Theme.of(context).textTheme.titleMedium),
          ),
          LinearProgressIndicator(value: bps == null ? 0 : fraction),
        ],
      ),
    );
  }
}
