import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/target_providers.dart';
import '../domain/target.dart';

class TargetListPage extends ConsumerWidget {
  const TargetListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(targetListProvider);
    final progress = ref.watch(targetProgressProvider);
    final filter = ref.watch(targetListProvider.notifier).filter;
    final canManage = ref.watch(authControllerProvider).user?.canManageTarget == true;
    final dash = progress.asData?.value;
    final board = dash is Success<TargetProgressDashboard> ? dash.value : null;

    return AppScaffold(
      title: AppStrings.targets,
      floatingActionButton: canManage
          ? FloatingActionButton(
              onPressed: () async {
                await context.push(AppRoutes.targetCreate);
                await _refresh(ref);
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          if (board != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
              child: _ProgressWidgets(
                dashboard: board,
                selected: filter.hasProduct
                    ? TargetKinds.product
                    : filter.scopeType == TargetKinds.team
                    ? TargetKinds.team
                    : filter.periodType,
                onSelect: (code) {
                  ref.read(targetListProvider.notifier).apply(switch (code) {
                    TargetKinds.product => const TargetListFilter(hasProduct: true),
                    TargetKinds.team => const TargetListFilter(scopeType: TargetKinds.team),
                    TargetKinds.monthly => const TargetListFilter(periodType: TargetKinds.monthly),
                    TargetKinds.daily => const TargetListFilter(periodType: TargetKinds.daily),
                    _ => const TargetListFilter(),
                  });
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
            child: Wrap(
              spacing: 8,
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: filter.periodType == null && filter.scopeType == null && !filter.hasProduct,
                  onSelected: (_) => ref.read(targetListProvider.notifier).apply(const TargetListFilter()),
                ),
                FilterChip(
                  label: const Text('Monthly'),
                  selected: filter.periodType == TargetKinds.monthly,
                  onSelected: (_) => ref.read(targetListProvider.notifier).apply(
                    const TargetListFilter(periodType: TargetKinds.monthly),
                  ),
                ),
                FilterChip(
                  label: const Text('Daily'),
                  selected: filter.periodType == TargetKinds.daily,
                  onSelected: (_) => ref.read(targetListProvider.notifier).apply(
                    const TargetListFilter(periodType: TargetKinds.daily),
                  ),
                ),
                FilterChip(
                  label: const Text('Team'),
                  selected: filter.scopeType == TargetKinds.team,
                  onSelected: (_) => ref.read(targetListProvider.notifier).apply(
                    const TargetListFilter(scopeType: TargetKinds.team),
                  ),
                ),
                FilterChip(
                  label: const Text('Product'),
                  selected: filter.hasProduct,
                  onSelected: (_) => ref.read(targetListProvider.notifier).apply(
                    const TargetListFilter(hasProduct: true),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _refresh(ref),
              child: AppAsyncBody(
                asyncValue: asyncPage,
                isEmpty: (page) => page.items.isEmpty,
                emptyTitle: 'No targets',
                emptyMessage: 'Set a monthly, daily, team, or product target to track live progress.',
                builder: (page) {
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(targetListProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.separated(
                      itemCount: page.items.length + extra,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        if (index >= page.items.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final item = page.items[index];
                        return ListTile(
                          title: Text(item.displayTitle),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                [
                                  item.periodLabel,
                                  item.percentLabel,
                                  'Bal ${item.balanceLabel}',
                                  'Need ${item.dailyRequiredLabel}/day',
                                  item.forecastLabel,
                                ].join(' · '),
                              ),
                              const SizedBox(height: 6),
                              LinearProgressIndicator(value: item.fraction),
                            ],
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await context.push(AppRoutes.targetDetailPath(item.id));
                            await _refresh(ref);
                          },
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _refresh(WidgetRef ref) async {
    await ref.read(targetListProvider.notifier).refresh();
    await ref.read(targetProgressProvider.notifier).refresh();
  }
}

class _ProgressWidgets extends StatelessWidget {
  const _ProgressWidgets({
    required this.dashboard,
    required this.selected,
    required this.onSelect,
  });

  final TargetProgressDashboard dashboard;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        Chip(label: Text('On track ${dashboard.onTrack}')),
        Chip(label: Text('Behind ${dashboard.behind}')),
        _StatChip(
          label: 'Monthly',
          value: '${dashboard.month.items.length}',
          selected: selected == TargetKinds.monthly,
          onTap: () => onSelect(TargetKinds.monthly),
        ),
        _StatChip(
          label: 'Daily',
          value: '${dashboard.today.items.length}',
          selected: selected == TargetKinds.daily,
          onTap: () => onSelect(TargetKinds.daily),
        ),
        _StatChip(
          label: 'Team',
          value: '${dashboard.teams.length}',
          selected: selected == TargetKinds.team,
          onTap: () => onSelect(TargetKinds.team),
        ),
        _StatChip(
          label: 'Product',
          value: '${dashboard.products.length}',
          selected: selected == TargetKinds.product,
          onTap: () => onSelect(TargetKinds.product),
        ),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text('$label $value'),
      onPressed: onTap,
      avatar: selected ? const Icon(Icons.check, size: 16) : null,
    );
  }
}
