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
import '../../leads/domain/lead.dart';
import '../application/follow_up_providers.dart';
import '../domain/follow_up_dashboard.dart';
import 'follow_up_widgets.dart';

class FollowUpListPage extends ConsumerWidget {
  const FollowUpListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(followUpListProvider);
    final dashboard = ref.watch(followUpDashboardProvider);
    final filter = ref.watch(followUpListProvider.notifier).filter;
    final canCreate =
        ref.watch(authControllerProvider).user?.canCreateFollowUp == true;
    final dash = dashboard.asData?.value;
    final board = dash is Success<FollowUpDashboard> ? dash.value : null;

    return AppScaffold(
      title: AppStrings.followUps,
      floatingActionButton: canCreate
          ? FloatingActionButton(
              onPressed: () async {
                await context.push(AppRoutes.followUpCreate);
                await _refresh(ref);
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          if (board != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                0,
              ),
              child: _EngineWidgets(
                dashboard: board,
                selected: filter.bucket,
                onSelect: (code) {
                  ref.read(followUpListProvider.notifier).apply(
                    FollowUpListFilter(
                      type: filter.type,
                      bucket: filter.bucket == code ? null : code,
                      status: code == null ? 'pending' : null,
                    ),
                  );
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              0,
            ),
            child: FollowUpFilterChips(
              status: filter.status,
              type: filter.type,
              overdue: filter.overdue,
              onChanged: ({status, type, overdue = false}) {
                ref.read(followUpListProvider.notifier).apply(
                  FollowUpListFilter(
                    status: status,
                    type: type,
                    overdue: overdue,
                    bucket: filter.bucket,
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _refresh(ref),
              child: filter.bucket == 'no_follow_up'
                  ? _GapList(dashboard: board)
                  : AppAsyncBody(
                      asyncValue: asyncPage,
                      isEmpty: (page) => page.items.isEmpty,
                      emptyTitle: 'No follow-ups',
                      emptyMessage: 'Schedule a call, WhatsApp, visit, or meeting.',
                      builder: (page) {
                        final extra = page.page.hasMore ? 1 : 0;
                        return NotificationListener<ScrollNotification>(
                          onNotification: (notification) {
                            if (notification.metrics.extentAfter < 240) {
                              ref.read(followUpListProvider.notifier).loadMore();
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
                              return _FollowUpTile(item: page.items[index]);
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
    await Future.wait([
      ref.read(followUpListProvider.notifier).refresh(),
      ref.read(followUpDashboardProvider.notifier).refresh(),
    ]);
  }
}

class _EngineWidgets extends StatelessWidget {
  const _EngineWidgets({
    required this.dashboard,
    required this.selected,
    required this.onSelect,
  });

  final FollowUpDashboard dashboard;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final widget in dashboard.widgets)
              _BucketCard(
                title: widget.title,
                count: widget.count,
                selected: selected == widget.code,
                onTap: () => onSelect(widget.code),
              ),
          ],
        ),
        if (dashboard.rules.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Past manager SLA: ${dashboard.overduePastManagerSla} · past admin SLA: ${dashboard.overduePastAdminSla}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _BucketCard extends StatelessWidget {
  const _BucketCard({
    required this.title,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Ink(
        width: 84,
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: selected ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$count', style: Theme.of(context).textTheme.headlineSmall),
            Text(title, style: Theme.of(context).textTheme.labelMedium),
          ],
        ),
      ),
    );
  }
}

class _GapList extends StatelessWidget {
  const _GapList({required this.dashboard});

  final FollowUpDashboard? dashboard;

  @override
  Widget build(BuildContext context) {
    final gaps = dashboard?.widget('no_follow_up')?.gaps ?? const <FollowUpGap>[];
    if (gaps.isEmpty) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Text('Every open lead has a follow-up.'),
          ),
        ],
      );
    }
    return ListView.separated(
      itemCount: gaps.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final item = gaps[index];
        return ListTile(
          leading: const Icon(Icons.person_search_outlined),
          title: Text(item.leadTitle),
          subtitle: Text(
            [item.leadNumber, if (item.ownerName != null) item.ownerName!].join(' · '),
          ),
          onTap: () => context.push(AppRoutes.leadDetailPath(item.leadId)),
        );
      },
    );
  }
}

class _FollowUpTile extends StatelessWidget {
  const _FollowUpTile({required this.item});

  final LeadFollowUp item;

  @override
  Widget build(BuildContext context) {
    final due = item.dueAt.toLocal().toString().substring(0, 16);
    final lead = [
      if (item.leadNumber != null) item.leadNumber!,
      if (item.leadTitle != null) item.leadTitle!,
    ].join(' · ');
    final bucket = item.engineBucket;
    return ListTile(
      leading: Icon(followUpTypeIcon(item.type)),
      title: Text(item.title),
      subtitle: Text(
        [
          FollowUpTypes.title(item.type),
          if (bucket != null) bucket.replaceAll('_', ' '),
          due,
          if (lead.isNotEmpty) lead,
        ].join(' · '),
      ),
      trailing: item.isPendingSync
          ? const Chip(
              label: Text(AppStrings.queuedOffline),
              visualDensity: VisualDensity.compact,
            )
          : null,
      onTap: () => context.push(AppRoutes.followUpDetailPath(item.id)),
    );
  }
}
