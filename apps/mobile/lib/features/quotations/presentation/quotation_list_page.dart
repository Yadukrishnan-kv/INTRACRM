import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';

class QuotationListPage extends ConsumerWidget {
  const QuotationListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPage = ref.watch(quotationListProvider);
    final dashboard = ref.watch(quotationDashboardProvider);
    final filter = ref.watch(quotationListProvider.notifier).filter;
    final canCreate =
        ref.watch(authControllerProvider).user?.canCreateQuotation == true;
    final summary = ref.watch(quotationSummaryProvider).asData?.value ?? const QuotationSummary();
    final dash = dashboard.asData?.value;
    final board = dash is Success<QuotationFollowUpDashboard> ? dash.value : null;

    return AppScaffold(
      title: AppStrings.quotations,
      actions: [
        IconButton(
          tooltip: AppStrings.search,
          onPressed: () => context.push(AppRoutes.search),
          icon: const Icon(Icons.search),
        ),
      ],
      floatingActionButton: canCreate
          ? FloatingActionButton(
              heroTag: 'fab-quotations',
              onPressed: () async {
                await context.push(AppRoutes.quotationCreate);
                await _refresh(ref);
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          _KpiRow(summary: summary),
          if (board != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
              child: _EngineWidgets(
                dashboard: board,
                selected: filter.bucket ?? (filter.pending ? QuotationFollowUpBuckets.pending : null),
                onSelect: (code) {
                  ref.read(quotationListProvider.notifier).apply(
                    QuotationListFilter(
                      leadId: filter.leadId,
                      pending: code == QuotationFollowUpBuckets.pending,
                      bucket: code == QuotationFollowUpBuckets.pending ? null : code,
                    ),
                  );
                },
              ),
            ),
          _Tabs(summary: summary, filter: filter, ref: ref),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _refresh(ref),
              child: AppAsyncBody(
                asyncValue: asyncPage,
                isEmpty: (page) => page.items.isEmpty,
                emptyTitle: 'No quotations',
                emptyMessage: 'Create a draft, send it, then follow up until it is won or lost.',
                builder: (page) {
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(quotationListProvider.notifier).loadMore();
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
                          subtitle: Text(
                            [
                              item.quotationNumber,
                              QuotationStatuses.title(item.status),
                              item.totalLabel,
                              if (item.closingPrediction != null) item.predictionLabel,
                              if (item.expectedCloseOn != null) 'Close ${item.expectedCloseOn}',
                              if (item.customerName != null) item.customerName!,
                            ].join(' · '),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await context.push(AppRoutes.quotationDetailPath(item.id));
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
    await ref.read(quotationListProvider.notifier).refresh();
    await ref.read(quotationDashboardProvider.notifier).refresh();
    ref.invalidate(quotationSummaryProvider);
  }
}

class _EngineWidgets extends StatelessWidget {
  const _EngineWidgets({
    required this.dashboard,
    required this.selected,
    required this.onSelect,
  });

  final QuotationFollowUpDashboard dashboard;
  final String? selected;
  final void Function(String? code) onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final widget in dashboard.widgets) ...[
            _BucketCard(
              title: widget.title,
              count: widget.count,
              selected: selected == widget.code,
              onTap: () => onSelect(selected == widget.code ? null : widget.code),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
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
        width: 96,
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

class _KpiRow extends StatelessWidget {
  const _KpiRow({required this.summary});

  final QuotationSummary summary;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      ('Total Quotations', '${summary.total}', AppColors.tealDark),
      ('Pending', '${summary.pending}', AppColors.warning),
      ('Approved', '${summary.count('approved')}', AppColors.success),
      ('Converted', '${summary.count('won')}', AppColors.teal),
      ('Quotation Value', summary.valueLabel, AppColors.tealDark),
    ];
    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
        itemCount: tiles.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final (label, value, color) = tiles[i];
          return Container(
            width: 128,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w700)),
                Text(label, style: Theme.of(context).textTheme.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.summary, required this.filter, required this.ref});

  final QuotationSummary summary;
  final QuotationListFilter filter;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final noBucket = filter.bucket == null;
    final tabs = <(String, int?, bool, QuotationListFilter)>[
      ('All Quotations', null, filter.status == null && !filter.pending && noBucket, QuotationListFilter(leadId: filter.leadId)),
      ('Drafts', summary.count('draft'), filter.status == 'draft' && noBucket && !filter.pending, QuotationListFilter(status: 'draft', leadId: filter.leadId)),
      ('Pending', summary.pending, filter.pending && noBucket, QuotationListFilter(pending: true, leadId: filter.leadId)),
      ('Approved', summary.count('approved'), filter.status == 'approved' && noBucket && !filter.pending, QuotationListFilter(status: 'approved', leadId: filter.leadId)),
      ('Rejected', summary.count('lost'), filter.status == 'lost' && noBucket && !filter.pending, QuotationListFilter(status: 'lost', leadId: filter.leadId)),
      ('Converted', summary.count('won'), filter.status == 'won' && noBucket && !filter.pending, QuotationListFilter(status: 'won', leadId: filter.leadId)),
    ];
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
        itemCount: tabs.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final (label, count, selected, next) = tabs[i];
          return ChoiceChip(
            label: Text(count == null ? label : '$label ($count)'),
            selected: selected,
            onSelected: (_) => ref.read(quotationListProvider.notifier).apply(next),
          );
        },
      ),
    );
  }
}
