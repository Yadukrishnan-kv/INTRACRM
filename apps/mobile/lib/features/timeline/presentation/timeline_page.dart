import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/timeline_providers.dart';
import '../domain/timeline_models.dart';

class TimelinePage extends ConsumerStatefulWidget {
  const TimelinePage({super.key});

  @override
  ConsumerState<TimelinePage> createState() => _TimelinePageState();
}

class _TimelinePageState extends ConsumerState<TimelinePage> {
  String? _eventCode;

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(timelineFeedProvider);
    return AppScaffold(
      title: AppStrings.timeline,
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: AppSpacing.xs),
                  child: FilterChip(
                    label: const Text('All'),
                    selected: _eventCode == null,
                    onSelected: (_) {
                      setState(() => _eventCode = null);
                      ref.read(timelineFeedProvider.notifier).filter(null);
                    },
                  ),
                ),
                for (final item in timelineCatalog)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpacing.xs),
                    child: FilterChip(
                      label: Text(item.title),
                      selected: _eventCode == item.code,
                      onSelected: (_) {
                        setState(() => _eventCode = item.code);
                        ref.read(timelineFeedProvider.notifier).filter(item.code);
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(timelineFeedProvider.notifier).refresh(),
              child: AppAsyncBody(
                asyncValue: feed,
                isEmpty: (page) => page.items.isEmpty,
                emptyTitle: 'No timeline events',
                emptyMessage: 'Lead changes, follow-ups, quotations, and visits appear here.',
                builder: (page) {
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(timelineFeedProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.separated(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      itemCount: page.items.length + extra,
                      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                      itemBuilder: (context, index) {
                        if (index >= page.items.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        return TimelineTile(
                          event: page.items[index],
                          showLead: true,
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

class TimelineTile extends StatelessWidget {
  const TimelineTile({super.key, required this.event, this.showLead = true});

  final TimelineEvent event;
  final bool showLead;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Icon(_iconFor(event.eventCode), size: 20)),
        title: Text(event.title),
        subtitle: Text(
          [
            if (showLead) '${event.leadNumber} · ${event.leadLabel}',
            if (event.actorName != null) event.actorName!,
            event.occurredAt.toLocal().toString(),
            if (event.body != null) event.body!,
          ].join('\n'),
        ),
        isThreeLine: true,
        onTap: showLead && event.leadId.isNotEmpty
            ? () => context.push(AppRoutes.leadDetailPath(event.leadId))
            : null,
      ),
    );
  }
}

IconData _iconFor(String code) {
  return switch (code) {
    'lead_created' => Icons.person_add_alt_1_outlined,
    'lead_updated' => Icons.edit_outlined,
    'status_changed' => Icons.swap_horiz,
    'follow_up_added' => Icons.event_available_outlined,
    'quotation_sent' => Icons.request_quote_outlined,
    'site_visit_added' => Icons.location_on_outlined,
    'warranty_issued' => Icons.verified_outlined,
    'call_started' => Icons.call_outlined,
    'whatsapp_sent' => Icons.chat_outlined,
    'sms_sent' => Icons.sms_outlined,
    'customer_synced' => Icons.sync_alt,
    'invoice_synced' => Icons.receipt_long_outlined,
    'payment_received' => Icons.payments_outlined,
    _ => Icons.timeline,
  };
}
