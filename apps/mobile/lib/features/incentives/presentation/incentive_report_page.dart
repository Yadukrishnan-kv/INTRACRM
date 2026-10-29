import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/confirm_dialog.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../reports/presentation/report_date_range_bar.dart';
import '../application/incentive_providers.dart';
import '../domain/incentive.dart';

/// Reports → Incentive & Achievement.
///
/// Four cards across the top — earned incentive, target achievement, won
/// orders, completion — then the payout status split and a per-person table.
class IncentiveReportPage extends ConsumerWidget {
  const IncentiveReportPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncReport = ref.watch(incentiveReportProvider);
    final canManage = ref.watch(authControllerProvider).user?.canManageIncentive == true;

    return AppScaffold(
      title: AppStrings.incentiveReport,
      actions: [
        if (canManage)
          IconButton(
            tooltip: AppStrings.incentivePlans,
            icon: const Icon(Icons.tune),
            onPressed: () => context.push(AppRoutes.incentivePlans),
          ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
            child: ReportDateRangeBar(
              range: ref.watch(incentiveReportFilterProvider).range,
              onChanged: (range) => ref
                  .read(incentiveReportFilterProvider.notifier)
                  .update((current) => current.copyWith(range: range)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(incentiveReportProvider.notifier).refresh(),
              child: AppAsyncBody<IncentiveReport>(
                asyncValue: asyncReport,
                emptyTitle: AppStrings.noIncentivesTitle,
                emptyMessage: AppStrings.noIncentivesMessage,
                isEmpty: (report) => report.isEmpty,
                builder: (report) {
                  final totals = report.totals;
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.md,
                      AppSpacing.sm,
                      AppSpacing.md,
                      AppSpacing.xl,
                    ),
                    children: [
                      const _StatusFilter(),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: _Card(
                              icon: Icons.account_balance_wallet_outlined,
                              value: formatIncentiveMoney(totals.earnedAmount),
                              label: AppStrings.earnedIncentive,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: _Card(
                              icon: Icons.track_changes,
                              value: totals.achievementLabel,
                              label: AppStrings.targetAchievement,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Row(
                        children: [
                          Expanded(
                            child: _Card(
                              icon: Icons.check_circle_outline,
                              value: '${totals.wonOrders}',
                              label: AppStrings.wonOrders,
                              tone: AppColors.success,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: _Card(
                              icon: Icons.percent,
                              value: formatIncentiveBps(totals.completionBps),
                              label: AppStrings.completion,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      SectionCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              AppStrings.payouts,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            InfoRow(
                              icon: Icons.savings_outlined,
                              label: AppStrings.payable,
                              value: formatIncentiveMoney(totals.payableAmount),
                            ),
                            InfoRow(
                              icon: Icons.lock_clock,
                              label: AppStrings.onHold,
                              value: formatIncentiveMoney(totals.holdAmount),
                            ),
                            InfoRow(
                              icon: Icons.paid_outlined,
                              label: AppStrings.paid,
                              value: formatIncentiveMoney(totals.paidAmount),
                            ),
                            if (report.byStatus.isNotEmpty) ...[
                              const SizedBox(height: AppSpacing.xs),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  for (final row in report.byStatus)
                                    StatusBadge(label: '${row.status} · ${row.count}'),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      if (report.byMember.isNotEmpty) _MemberTable(rows: report.byMember),
                      if (report.items.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.sm),
                        _PayoutList(payouts: report.items, canManage: canManage),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusFilter extends ConsumerWidget {
  const _StatusFilter();

  static const _statuses = <(String?, String)>[
    (null, 'All'),
    ('draft', 'Draft'),
    ('approved', 'Approved'),
    ('paid', 'Paid'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(incentiveReportFilterProvider).status;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (code, label) in _statuses)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: ChoiceChip(
                label: Text(label),
                selected: selected == code,
                onSelected: (_) => ref
                    .read(incentiveReportFilterProvider.notifier)
                    .update((current) => current.copyWith(status: code)),
              ),
            ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.icon,
    required this.value,
    required this.label,
    this.tone,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      child: Column(
        children: [
          Icon(icon, size: 22, color: tone ?? AppColors.info),
          const SizedBox(height: 8),
          FittedBox(
            child: Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
          ),
        ],
      ),
    );
  }
}

class _MemberTable extends StatelessWidget {
  const _MemberTable({required this.rows});

  final List<IncentiveMemberRow> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            AppStrings.byMember,
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Expanded(
                flex: 4,
                child: Text(AppStrings.userName, style: theme.textTheme.labelSmall),
              ),
              Expanded(
                flex: 2,
                child: Text(
                  AppStrings.attainment,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
              Expanded(
                flex: 3,
                child: Text(
                  AppStrings.earnedIncentive,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
            ],
          ),
          const Divider(height: 12),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.membershipName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          '${row.wonOrders} ${AppStrings.wonOrders.toLowerCase()}',
                          style: theme.textTheme.labelSmall
                              ?.copyWith(color: context.palette.muted),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      formatIncentiveBps(row.attainmentBps),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      formatIncentiveMoney(row.earnedAmount),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Individual payouts with the approve (draft → approved) and mark-paid
/// (approved → paid) actions; both need `incentive:manage`.
class _PayoutList extends ConsumerStatefulWidget {
  const _PayoutList({required this.payouts, required this.canManage});

  final List<IncentivePayout> payouts;
  final bool canManage;

  @override
  ConsumerState<_PayoutList> createState() => _PayoutListState();
}

class _PayoutListState extends ConsumerState<_PayoutList> {
  String? _busyId;

  Future<void> _approve(IncentivePayout payout) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.approvePayout,
      message: AppStrings.approvePayoutMessage(
        payout.membershipName ?? payout.planName,
        formatIncentiveMoney(payout.payableAmount),
      ),
      confirmLabel: AppStrings.approvePayout,
    );
    if (!confirmed || !mounted) {
      return;
    }
    await _run(payout, () => ref.read(incentiveApiProvider).approve(payout.id));
  }

  Future<void> _markPaid(IncentivePayout payout) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.markPayoutPaid,
      message: AppStrings.markPayoutPaidMessage(
        payout.membershipName ?? payout.planName,
        formatIncentiveMoney(payout.payableAmount),
      ),
      confirmLabel: AppStrings.markPayoutPaid,
    );
    if (!confirmed || !mounted) {
      return;
    }
    await _run(payout, () => ref.read(incentiveApiProvider).markPaid(payout.id));
  }

  Future<void> _void(IncentivePayout payout) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.voidPayout,
      message: AppStrings.voidPayoutMessage(
        payout.membershipName ?? payout.planName,
        formatIncentiveMoney(payout.payableAmount),
      ),
      confirmLabel: AppStrings.voidPayout,
    );
    if (!confirmed || !mounted) {
      return;
    }
    await _run(payout, () => ref.read(incentiveApiProvider).voidPayout(payout.id));
  }

  Future<void> _run(
    IncentivePayout payout,
    Future<Result<Object?>> Function() action,
  ) async {
    setState(() => _busyId = payout.id);
    final result = await action();
    if (!mounted) {
      return;
    }
    setState(() => _busyId = null);
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await ref.read(incentiveReportProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            AppStrings.payoutRows,
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          for (final payout in widget.payouts)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(payout.membershipName ?? payout.planName),
              subtitle: Text(
                [
                  payout.planName,
                  '${payout.periodStart} – ${payout.periodEnd}',
                  payout.status,
                ].join(' · '),
              ),
              trailing: _busyId == payout.id
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : !widget.canManage || !(payout.isDraft || payout.isApproved)
                  ? Text(formatIncentiveMoney(payout.payableAmount))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextButton(
                          onPressed: _busyId != null
                              ? null
                              : payout.isDraft
                              ? () => _approve(payout)
                              : () => _markPaid(payout),
                          child: Text(
                            payout.isDraft ? AppStrings.approvePayout : AppStrings.markPayoutPaid,
                          ),
                        ),
                        IconButton(
                          tooltip: AppStrings.voidPayout,
                          onPressed: _busyId != null ? null : () => _void(payout),
                          icon: const Icon(Icons.block),
                        ),
                      ],
                    ),
            ),
        ],
      ),
    );
  }
}
