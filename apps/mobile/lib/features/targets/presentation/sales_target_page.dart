import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/target_providers.dart';
import '../domain/sales_board.dart';
import 'widgets/sales_gauge.dart';
import 'widgets/sales_podium.dart';

/// Monthly Sales Target: the gauge and pace banner for the viewer, the
/// leaderboard everyone is scored on, the forecast and suggestions, and the
/// day-by-day Insights table.
class SalesTargetPage extends ConsumerWidget {
  const SalesTargetPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(salesBoardProvider);
    final filter = ref.watch(salesBoardFilterProvider);

    return AppScaffold(
      title: AppStrings.monthlySalesTarget,
      actions: [
        IconButton(
          tooltip: AppStrings.share,
          icon: const Icon(Icons.ios_share),
          onPressed: () => _share(context, ref),
        ),
      ],
      body: RefreshIndicator(
        onRefresh: () => ref.read(salesBoardProvider.notifier).refresh(),
        child: AppAsyncBody<SalesBoard>(
          asyncValue: asyncBoard,
          emptyTitle: AppStrings.noTargetsTitle,
          emptyMessage: AppStrings.noTargetsMessage,
          isEmpty: (board) => board.overall.targetValue <= 0 && board.standings.isEmpty,
          builder: (board) {
            final card = board.card(mine: filter.mine);
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                AppSpacing.xl,
              ),
              children: [
                _Controls(board: board, filter: filter),
                const SizedBox(height: AppSpacing.sm),
                _GaugeCard(board: board, card: card),
                const SizedBox(height: AppSpacing.sm),
                _ForecastRow(board: board, card: card),
                const SizedBox(height: AppSpacing.sm),
                if (board.podium.isNotEmpty) ...[
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionTitle(AppStrings.leaderboard),
                        const SizedBox(height: AppSpacing.sm),
                        SalesPodium(
                          entries: board.podium,
                          money: board.isMoney,
                          onTap: (entry) =>
                              context.push(AppRoutes.performanceDetailPath(entry.membershipId)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
                _RankingCard(board: board),
                const SizedBox(height: AppSpacing.sm),
                _InsightsCard(board: board),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _share(BuildContext context, WidgetRef ref) async {
    final board = ref.read(salesBoardProvider).asData?.value;
    final data = board?.valueOrNull;
    if (data == null) {
      return;
    }
    final card = data.card(mine: ref.read(salesBoardFilterProvider).mine);
    // No share_plus in this app's dependency set, so the summary goes to the
    // clipboard and the user pastes it wherever they were going to send it.
    await Clipboard.setData(
      ClipboardData(
        text: [
          '${AppStrings.monthlySalesTarget} — ${data.period.label}',
          '${card.name}: ${data.format(card.achievedValue)} of ${data.format(card.targetValue)} (${card.percentLabel})',
          card.pace.detail,
        ].join('\n'),
      ),
    );
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text(AppStrings.summaryCopied)));
    }
  }
}

/// Period selector and the "My Target" toggle, in one row above the gauge.
class _Controls extends ConsumerWidget {
  const _Controls({required this.board, required this.filter});

  final SalesBoard board;
  final SalesBoardFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final periods = board.periods.isEmpty
        ? [SalesBoardOption(code: board.period.code, title: board.period.title)]
        : board.periods;
    return Row(
      children: [
        Text(AppStrings.show, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(width: AppSpacing.xs),
        DropdownButton<String>(
          value: periods.any((option) => option.code == filter.period)
              ? filter.period
              : periods.first.code,
          underline: const SizedBox.shrink(),
          items: [
            for (final option in periods)
              DropdownMenuItem(value: option.code, child: Text(option.title)),
          ],
          onChanged: (value) {
            if (value != null) {
              ref.read(salesBoardFilterProvider.notifier).update(
                    (current) => current.copyWith(period: value),
                  );
            }
          },
        ),
        const Spacer(),
        Text(AppStrings.myTarget, style: Theme.of(context).textTheme.labelMedium),
        Switch(
          value: filter.mine,
          // Without a membership on the board there is no personal card to
          // switch to, so the toggle stays off and disabled.
          onChanged: board.hasPersonalCard
              ? (value) => ref.read(salesBoardFilterProvider.notifier).update(
                    (current) => current.copyWith(mine: value),
                  )
              : null,
        ),
      ],
    );
  }
}

class _GaugeCard extends StatelessWidget {
  const _GaugeCard({required this.board, required this.card});

  final SalesBoard board;
  final SalesBoardCard card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = card.pace.onTrack
        ? (fg: AppColors.success, bg: context.palette.successSurface)
        : (fg: AppColors.danger, bg: context.palette.dangerSurface);
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        card.name,
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Row(
                        children: [
                          Icon(Icons.calendar_today_outlined,
                              size: 13, color: context.palette.muted),
                          const SizedBox(width: 4),
                          Text(
                            board.period.label,
                            style: theme.textTheme.bodySmall
                                ?.copyWith(color: context.palette.muted),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (card.rank != null)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    avatar: const Icon(Icons.emoji_events_outlined, size: 16),
                    label: Text('${card.rankLabel} of ${card.rankOf}'),
                  ),
              ],
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: SalesGauge(
                progress: card.fraction,
                valueLabel: board.format(card.achievedValue),
                caption: '${board.metricName} · ${card.percentLabel}',
                maxLabel: board.format(card.targetValue),
                onTrack: card.pace.onTrack,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                _Line(AppStrings.totalTarget, board.format(card.targetValue)),
                _Line(AppStrings.targetAchieved, board.format(card.achievedValue)),
                _Line(AppStrings.leftToAchieve, board.format(card.remaining)),
                _Line(AppStrings.dailyAverage, board.format(card.dailyAverage)),
                if (card.dailyRequired != null)
                  _Line(AppStrings.dailyRequired, board.format(card.dailyRequired!)),
                _Line(
                  AppStrings.timeLeft,
                  '${card.daysRemaining} ${card.daysRemaining == 1 ? AppStrings.dayUnit : AppStrings.daysUnit}',
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Container(
            width: double.infinity,
            color: tone.bg,
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      card.pace.onTrack ? Icons.check_circle : Icons.error_outline,
                      size: 16,
                      color: tone.fg,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      card.pace.title,
                      style: theme.textTheme.labelLarge
                          ?.copyWith(color: tone.fg, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(card.pace.detail, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.palette.muted),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _ForecastRow extends StatelessWidget {
  const _ForecastRow({required this.board, required this.card});

  final SalesBoard board;
  final SalesBoardCard card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final delta = card.forecastDelta;
    // The ListView gives this row unbounded height, so `stretch` alone would
    // force an infinite height; IntrinsicHeight bounds it to the taller card.
    return IntrinsicHeight(
      child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: SectionCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Icon(Icons.trending_up, size: 15, color: AppColors.success),
                    const SizedBox(width: 4),
                    Text(AppStrings.forecast, style: theme.textTheme.labelMedium),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      card.forecastValue == null ? '—' : board.format(card.forecastValue!),
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    if (delta != null) ...[
                      const SizedBox(width: 6),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Text(
                          board.formatDelta(delta),
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: delta >= 0 ? AppColors.success : AppColors.danger,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                Text(
                  '${AppStrings.fromTargetOf} ${board.format(card.targetValue)}',
                  style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: card.fraction,
                    minHeight: 6,
                    backgroundColor: context.palette.tealSoft,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: SectionCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Icon(Icons.lightbulb_outline, size: 15, color: AppColors.warning),
                    const SizedBox(width: 4),
                    Text(AppStrings.suggestions, style: theme.textTheme.labelMedium),
                  ],
                ),
                const SizedBox(height: 6),
                for (final suggestion in board.suggestions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('• ', style: theme.textTheme.bodySmall),
                        Expanded(
                          child: Text(suggestion.detail, style: theme.textTheme.bodySmall),
                        ),
                      ],
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

class _RankingCard extends StatelessWidget {
  const _RankingCard({required this.board});

  final SalesBoard board;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (board.standings.isEmpty) {
      return const SizedBox.shrink();
    }
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionTitle(AppStrings.ranking),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              const SizedBox(width: 28),
              Expanded(
                flex: 4,
                child: Text(AppStrings.userName, style: theme.textTheme.labelSmall),
              ),
              Expanded(
                flex: 2,
                child: Text(
                  AppStrings.target,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
              Expanded(
                flex: 2,
                child: Text(
                  AppStrings.sale,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
            ],
          ),
          const Divider(height: 12),
          for (final row in board.standings)
            InkWell(
              onTap: () => context.push(AppRoutes.performanceDetailPath(row.membershipId)),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    SizedBox(
                      width: 28,
                      child: Text(
                        '${row.rank}',
                        style: theme.textTheme.labelMedium
                            ?.copyWith(fontWeight: FontWeight.w800, color: context.palette.muted),
                      ),
                    ),
                    Expanded(
                      flex: 4,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          if (row.designation != null && row.designation!.isNotEmpty)
                            Text(
                              row.designation!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelSmall
                                  ?.copyWith(color: context.palette.muted),
                            ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        board.format(row.targetValue),
                        textAlign: TextAlign.right,
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        board.format(row.achievedValue),
                        textAlign: TextAlign.right,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: row.onTrack ? AppColors.success : AppColors.danger,
                        ),
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

class _InsightsCard extends StatelessWidget {
  const _InsightsCard({required this.board});

  final SalesBoard board;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (board.insights.isEmpty) {
      return const SizedBox.shrink();
    }
    // Newest first: the last few days are what a rep checks the trail for.
    final rows = board.insights.reversed.toList(growable: false);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: false,
        title: Text(
          AppStrings.insights,
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          Row(
            children: [
              Expanded(flex: 3, child: Text(AppStrings.date, style: theme.textTheme.labelSmall)),
              Expanded(
                flex: 2,
                child: Text(
                  AppStrings.sale,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
              Expanded(
                flex: 2,
                child: Text(
                  AppStrings.average,
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall,
                ),
              ),
            ],
          ),
          const Divider(height: 12),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Expanded(flex: 3, child: Text(row.dayLabel, style: theme.textTheme.bodySmall)),
                  Expanded(
                    flex: 2,
                    child: Text(
                      board.format(row.value),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      board.format(row.runningAverage),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall?.copyWith(color: context.palette.muted),
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}
