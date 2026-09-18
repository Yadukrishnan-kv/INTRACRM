import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../application/performance_providers.dart';
import '../domain/performance.dart';

class PerformanceListPage extends ConsumerWidget {
  const PerformanceListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(performanceBoardProvider);
    final filter = ref.watch(performanceBoardProvider.notifier).filter;
    final catalog = ref.watch(performanceCatalogProvider).asData?.value;
    final teams = catalog is Success<PerformanceCatalog> ? catalog.value.teams : const <PerformanceOption>[];
    final membershipId = ref.watch(authControllerProvider).user?.membershipId;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Target & Achievement'),
        actions: [
          if (membershipId != null)
            IconButton(
              tooltip: AppStrings.myScore,
              onPressed: () async {
                await context.push(AppRoutes.performanceDetailPath(membershipId));
                await ref.read(performanceBoardProvider.notifier).refresh();
              },
              icon: const Icon(Icons.person_outline),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                _periodTab(ref, filter, 'Monthly', 'monthly'),
                _periodTab(ref, filter, 'Daily', 'daily'),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => _apply(ref, filter, periodType: 'monthly'),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: AppAsyncBody(
                    asyncValue: asyncBoard,
                    builder: (board) => Text(
                      board.period.label,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => _apply(ref, filter, periodType: filter.periodType),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
          if (teams.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: const Text('All teams'),
                      selected: filter.teamId == null,
                      onSelected: (_) => _apply(ref, filter, clearTeam: true),
                    ),
                  ),
                  for (final team in teams)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(team.name),
                        selected: filter.teamId == team.id,
                        onSelected: (_) => _apply(ref, filter, teamId: team.id),
                      ),
                    ),
                ],
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(performanceBoardProvider.notifier).refresh(),
              child: AppAsyncBody(
                asyncValue: asyncBoard,
                isEmpty: (board) => _rows(board, filter.board).isEmpty,
                emptyTitle: 'No standings',
                emptyMessage: 'Active staff appear here once they have leads, follow-ups, or quotations.',
                builder: (board) {
                  final rows = _rows(board, filter.board);
                  final leads = rows.fold<int>(0, (sum, item) => sum + item.leadsCreated);
                  final followUps = rows.fold<int>(0, (sum, item) => sum + item.followUpsCompleted);
                  final quotations = rows.fold<int>(0, (sum, item) => sum + item.quotationsSent);
                  final won = rows.fold<int>(0, (sum, item) => sum + item.leadsWon);
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      SectionCard(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                        child: Column(
                          children: [
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 8),
                              child: Row(
                                children: [
                                  Expanded(flex: 3, child: Text('Staff', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12))),
                                  Expanded(child: Text('Target', textAlign: TextAlign.right, style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12))),
                                  Expanded(child: Text('Ach.', textAlign: TextAlign.right, style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12))),
                                  SizedBox(width: 52, child: Text('%', textAlign: TextAlign.right, style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12))),
                                ],
                              ),
                            ),
                            const Divider(height: 1),
                            for (final item in rows)
                              InkWell(
                                onTap: () async {
                                  await context.push(AppRoutes.performanceDetailPath(item.membershipId));
                                  await ref.read(performanceBoardProvider.notifier).refresh();
                                },
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        flex: 3,
                                        child: Row(
                                          children: [
                                            InitialsAvatar(name: item.name, size: 32),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: Text(
                                                item.name,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(fontWeight: FontWeight.w600),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Expanded(
                                        child: Text(
                                          formatRupees(item.salesTargetMinor),
                                          textAlign: TextAlign.right,
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                      ),
                                      Expanded(
                                        child: Text(
                                          formatRupees(item.revenueMinor),
                                          textAlign: TextAlign.right,
                                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                        ),
                                      ),
                                      SizedBox(
                                        width: 52,
                                        child: Text(
                                          bpsLabel(item.salesAchievementBps ?? item.scoreBps),
                                          textAlign: TextAlign.right,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.teal,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 2.3,
                        children: [
                          StatTile(icon: Icons.person_add_alt_1_outlined, label: 'Leads Received', value: '$leads'),
                          StatTile(icon: Icons.task_alt_outlined, label: 'Follow-ups Done', value: '$followUps'),
                          StatTile(icon: Icons.request_quote_outlined, label: 'Quotations Sent', value: '$quotations'),
                          StatTile(icon: Icons.emoji_events_outlined, label: 'Orders Won', value: '$won'),
                        ],
                      ),
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

  Widget _periodTab(WidgetRef ref, PerformanceFilter filter, String label, String value) {
    final selected = filter.periodType == value;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          selected: selected,
          label: Center(child: Text(label)),
          selectedColor: AppColors.tealSoft,
          labelStyle: TextStyle(
            color: selected ? AppColors.teal : AppColors.muted,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
          onSelected: (_) => _apply(ref, filter, periodType: value),
        ),
      ),
    );
  }

  void _apply(
    WidgetRef ref,
    PerformanceFilter current, {
    String? periodType,
    String? teamId,
    bool clearTeam = false,
    String? board,
  }) {
    ref.read(performanceBoardProvider.notifier).apply(
      PerformanceFilter(
        periodType: periodType ?? current.periodType,
        teamId: clearTeam ? null : teamId ?? current.teamId,
        board: board ?? current.board,
      ),
    );
  }

  List<StaffPerformance> _rows(PerformanceBoard board, String code) {
    return switch (code) {
      PerformanceBoards.leadConversion => board.leaderboards.leadConversion,
      PerformanceBoards.followUpCompletion => board.leaderboards.followUpCompletion,
      PerformanceBoards.salesAchievement => board.leaderboards.salesAchievement,
      PerformanceBoards.quotationConversion => board.leaderboards.quotationConversion,
      _ => board.standings,
    };
  }
}
