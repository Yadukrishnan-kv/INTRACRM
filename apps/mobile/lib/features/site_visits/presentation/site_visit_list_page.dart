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
import '../application/site_visit_providers.dart';
import '../domain/site_visit.dart';

class SiteVisitListPage extends ConsumerWidget {
  const SiteVisitListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(siteVisitListProvider);
    final filter = ref.watch(siteVisitListProvider.notifier).filter;
    final canCreate =
        ref.watch(authControllerProvider).user?.canCreateSiteVisit == true;

    return AppScaffold(
      title: AppStrings.siteVisits,
      floatingActionButton: canCreate
          ? FloatingActionButton(
              onPressed: () async {
                await context.push(AppRoutes.siteVisitCreate);
                await ref.read(siteVisitListProvider.notifier).refresh();
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
            child: Wrap(
              spacing: 8,
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: filter.status == null && !filter.overdue,
                  onSelected: (_) => ref.read(siteVisitListProvider.notifier).apply(
                    SiteVisitListFilter(leadId: filter.leadId),
                  ),
                ),
                FilterChip(
                  label: const Text(AppStrings.overdue),
                  selected: filter.overdue,
                  onSelected: (_) => ref.read(siteVisitListProvider.notifier).apply(
                    SiteVisitListFilter(overdue: true, leadId: filter.leadId),
                  ),
                ),
                for (final status in [
                  SiteVisitStatuses.scheduled,
                  SiteVisitStatuses.inProgress,
                  SiteVisitStatuses.completed,
                ])
                  FilterChip(
                    label: Text(SiteVisitStatuses.title(status)),
                    selected: filter.status == status && !filter.overdue,
                    onSelected: (_) => ref.read(siteVisitListProvider.notifier).apply(
                      SiteVisitListFilter(status: status, leadId: filter.leadId),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(siteVisitListProvider.notifier).refresh(),
              child: AppAsyncBody(
                asyncValue: asyncPage,
                isEmpty: (page) => page.items.isEmpty,
                emptyTitle: 'No site visits',
                emptyMessage: 'Schedule a visit, then check in with GPS, photos, and feedback.',
                builder: (page) {
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(siteVisitListProvider.notifier).loadMore();
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
                          title: Text(item.title),
                          subtitle: Text(
                            [
                              SiteVisitStatuses.title(item.status),
                              item.scheduledAt.toLocal().toString().substring(0, 16),
                              if (item.city != null) item.city!,
                              if (item.assigneeName != null) item.assigneeName!,
                              if (item.checkInLocation != null) 'GPS',
                              if (item.photoCount > 0) '${item.photoCount} photos',
                            ].join(' · '),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await context.push(AppRoutes.siteVisitDetailPath(item.id));
                            await ref.read(siteVisitListProvider.notifier).refresh();
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
}
