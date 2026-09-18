import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/target_providers.dart';
import '../domain/target.dart';

class TargetDetailPage extends ConsumerStatefulWidget {
  const TargetDetailPage({super.key, required this.targetId});

  final String targetId;

  @override
  ConsumerState<TargetDetailPage> createState() => _TargetDetailPageState();
}

class _TargetDetailPageState extends ConsumerState<TargetDetailPage> {
  Target? _item;
  Failure? _failure;
  var _loading = true;

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
    final result = await ref.read(targetApiProvider).getById(widget.targetId);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (result is Success) {
        _item = result.value.data;
      } else if (result is Err) {
        _failure = result.failure;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return AppScaffold(
      title: AppStrings.target,
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
                  Text(item.displayTitle, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final kind in item.kinds) Chip(label: Text(TargetKinds.title(kind))),
                      Chip(label: Text(item.forecastLabel)),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text('${item.achievedLabel} of ${item.targetLabel} · ${item.percentLabel}'),
                  const SizedBox(height: AppSpacing.sm),
                  LinearProgressIndicator(value: item.fraction, minHeight: 10),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _StatCard(label: AppStrings.achievementPercent, value: item.percentLabel),
                      _StatCard(label: AppStrings.balance, value: item.balanceLabel),
                      _StatCard(label: AppStrings.dailyRequirement, value: item.dailyRequiredLabel),
                      _StatCard(
                        label: AppStrings.forecast,
                        value: item.forecastValueLabel,
                        hint: '${item.forecastPercentLabel} · ${item.forecastLabel}',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    [
                      'Expected by today ${item.formatValue(item.expectedValue)}',
                      'Pace ${item.formatRate(item.plannedDaily)}/day planned',
                      '${item.daysRemaining} day${item.daysRemaining == 1 ? '' : 's'} left',
                    ].join(' · '),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(AppStrings.period),
                    subtitle: Text('${item.periodLabel} · ${item.periodStart} – ${item.periodEnd}'),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(AppStrings.scope),
                    subtitle: Text(item.scopeName ?? TargetKinds.title(item.scopeType)),
                  ),
                  if (item.productName != null)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text(AppStrings.product),
                      subtitle: Text(item.productName!),
                    ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(AppStrings.remaining),
                    subtitle: Text(
                      item.signedBalance < 0
                          ? 'Surplus ${item.formatValue(-item.signedBalance)}'
                          : item.formatValue(item.remaining),
                    ),
                  ),
                  if (item.notes != null && item.notes!.isNotEmpty)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text(AppStrings.notes),
                      subtitle: Text(item.notes!),
                    ),
                ],
              ),
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, this.hint});

  final String label;
  final String value;
  final String? hint;

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
              if (hint != null)
                Text(hint!, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
