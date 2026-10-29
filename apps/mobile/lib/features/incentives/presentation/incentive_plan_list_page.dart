import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../application/incentive_providers.dart';
import '../domain/incentive.dart';

/// Incentive plans and their attainment slabs, with a per-plan "compute this
/// period" action. Managers create a plan from the button and edit one by
/// tapping its card.
class IncentivePlanListPage extends ConsumerWidget {
  const IncentivePlanListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPlans = ref.watch(incentivePlansProvider);
    final canManage = ref.watch(authControllerProvider).user?.canManageIncentive == true;

    return AppScaffold(
      title: AppStrings.incentivePlans,
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              heroTag: 'fab-incentive-plans',
              onPressed: () => context.push(AppRoutes.incentivePlanCreate),
              icon: const Icon(Icons.add),
              label: const Text('New plan'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.read(incentivePlansProvider.notifier).refresh(),
        child: AppAsyncBody<List<IncentivePlan>>(
          asyncValue: asyncPlans,
          emptyTitle: AppStrings.noIncentivesTitle,
          emptyMessage: AppStrings.noIncentivesMessage,
          isEmpty: (plans) => plans.isEmpty,
          builder: (plans) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.xl,
            ),
            children: [
              for (final plan in plans)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: _PlanCard(plan: plan, canManage: canManage),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends ConsumerStatefulWidget {
  const _PlanCard({required this.plan, required this.canManage});

  final IncentivePlan plan;
  final bool canManage;

  @override
  ConsumerState<_PlanCard> createState() => _PlanCardState();
}

class _PlanCardState extends ConsumerState<_PlanCard> {
  bool _computing = false;

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    final theme = Theme.of(context);
    final card = SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  plan.name,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              StatusBadge(label: plan.status),
            ],
          ),
          Text(
            '${plan.metricName} · ${plan.periodType} · ${plan.basis}',
            style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
          ),
          if (plan.description != null && plan.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(plan.description!, style: theme.textTheme.bodySmall),
          ],
          if (plan.hasIssues) ...[
            const SizedBox(height: AppSpacing.xs),
            for (final issue in plan.coverageIssues)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.warning_amber_rounded, size: 14, color: AppColors.warning),
                  const SizedBox(width: 4),
                  Expanded(child: Text(issue, style: theme.textTheme.labelSmall)),
                ],
              ),
          ],
          if (plan.slabs.isNotEmpty) ...[
            const Divider(height: 18),
            Text(AppStrings.slabs, style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            for (final slab in plan.slabs)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        slab.label ?? slab.bandLabel,
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    Text(
                      slab.payoutLabel,
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
          ],
          if (plan.holdBps > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${AppStrings.onHold}: ${(plan.holdBps / 100).round()}%',
                style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
              ),
            ),
          if (widget.canManage) ...[
            const SizedBox(height: AppSpacing.xs),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonalIcon(
                onPressed: _computing ? null : _compute,
                icon: _computing
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.calculate_outlined, size: 18),
                label: const Text(AppStrings.computePeriod),
              ),
            ),
          ],
        ],
      ),
    );
    if (!widget.canManage) {
      return card;
    }
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.push(AppRoutes.incentivePlanEditPath(plan.id)),
      child: card,
    );
  }

  Future<void> _compute() async {
    final plan = widget.plan;
    String? periodStart;
    String? periodEnd;
    // The server can't infer a custom period, so it needs explicit dates.
    if (plan.periodType == 'custom') {
      final range = await _pickCustomPeriod(plan);
      if (range == null || !mounted) {
        return;
      }
      periodStart = _ymd(range.start);
      periodEnd = _ymd(range.end);
    }
    setState(() => _computing = true);
    final messenger = ScaffoldMessenger.of(context);
    final result = await ref.read(incentiveApiProvider).compute(
          planId: plan.id,
          periodStart: periodStart,
          periodEnd: periodEnd,
        );
    if (!mounted) {
      return;
    }
    setState(() => _computing = false);
    switch (result) {
      case Err(:final failure):
        messenger.showSnackBar(SnackBar(content: Text(failure.message)));
      case Success(:final value):
        final data = value.data;
        final computed = data['computed'] ?? 0;
        final skipped = data['skipped'] ?? 0;
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              '${AppStrings.computedPayouts}: $computed'
              '${skipped == 0 ? '' : ' · ${AppStrings.skippedLocked}: $skipped'}',
            ),
          ),
        );
        // The report reads the rows this just wrote.
        ref.invalidate(incentiveReportProvider);
        await ref.read(incentivePlansProvider.notifier).refresh();
    }
  }

  /// Asks which dates to compute a custom-period plan over, defaulting to
  /// the plan's effective window (capped at today).
  Future<DateTimeRange?> _pickCustomPeriod(IncentivePlan plan) {
    final today = DateUtils.dateOnly(DateTime.now());
    final from = DateTime.tryParse(plan.effectiveFrom) ?? today;
    final to = DateTime.tryParse(plan.effectiveTo ?? '') ?? today;
    final end = to.isAfter(today) ? today : to;
    return showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      initialDateRange: DateTimeRange(start: from.isAfter(end) ? end : from, end: end),
    );
  }

  static String _ymd(DateTime date) => date.toIso8601String().substring(0, 10);
}
