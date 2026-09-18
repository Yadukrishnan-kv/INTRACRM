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
import '../application/warranty_providers.dart';
import '../domain/warranty.dart';

class WarrantyListPage extends ConsumerWidget {
  const WarrantyListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(warrantyListProvider);
    final filter = ref.watch(warrantyListProvider.notifier).filter;
    final canCreate = ref.watch(authControllerProvider).user?.canCreateWarranty == true;

    return AppScaffold(
      title: AppStrings.warranties,
      floatingActionButton: canCreate
          ? FloatingActionButton(
              onPressed: () async {
                await context.push(AppRoutes.warrantyCreate);
                await ref.read(warrantyListProvider.notifier).refresh();
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
                  selected: filter.status == null,
                  onSelected: (_) => ref.read(warrantyListProvider.notifier).apply(
                    WarrantyListFilter(leadId: filter.leadId, quotationId: filter.quotationId),
                  ),
                ),
                for (final status in WarrantyStatuses.all)
                  FilterChip(
                    label: Text(WarrantyStatuses.title(status)),
                    selected: filter.status == status,
                    onSelected: (_) => ref.read(warrantyListProvider.notifier).apply(
                      WarrantyListFilter(
                        status: status,
                        leadId: filter.leadId,
                        quotationId: filter.quotationId,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(warrantyListProvider.notifier).refresh(),
              child: AppAsyncBody(
                asyncValue: asyncPage,
                isEmpty: (page) => page.items.isEmpty,
                emptyTitle: 'No warranty cards',
                emptyMessage: 'Issue a card after a sale to generate QR, PDF, and a verification URL.',
                builder: (page) {
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(warrantyListProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
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
                          title: Text(item.cardNumber),
                          subtitle: Text(
                            [
                              item.statusLabel,
                              '${item.warrantyStartOn} – ${item.warrantyEndOn}',
                              if (item.serialNumber != null) item.serialNumber!,
                              if (item.customerName != null) item.customerName!,
                            ].join(' · '),
                          ),
                          onTap: () async {
                            await context.push(AppRoutes.warrantyDetailPath(item.id));
                            await ref.read(warrantyListProvider.notifier).refresh();
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
