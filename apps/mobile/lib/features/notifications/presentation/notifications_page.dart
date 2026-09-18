import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/notification_providers.dart';
import '../data/notifications_api.dart';
import '../domain/notification_target.dart';

class NotificationPage {
  const NotificationPage({required this.items, required this.page});

  final List<InboxNotification> items;
  final PageMeta page;
}

final notificationInboxProvider =
    AsyncNotifierProvider<NotificationInboxController, Result<NotificationPage>>(
      NotificationInboxController.new,
    );

class NotificationInboxController extends AsyncNotifier<Result<NotificationPage>> {
  @override
  Future<Result<NotificationPage>> build() {
    ref.listen<int>(inboxRefreshTickProvider, (previous, next) {
      if (previous != next) {
        refresh();
      }
    });
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<NotificationPage>> _load() async {
    final result = await ref.read(notificationsApiProvider).list();
    return switch (result) {
      Success(:final value) => Success(
        NotificationPage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(notificationInboxProvider);
    return AppScaffold(
      title: AppStrings.notifications,
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationInboxProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: inbox,
          isEmpty: (page) => page.items.isEmpty,
          emptyTitle: AppStrings.notifications,
          emptyMessage: 'Lead assigned, follow-up, and quotation alerts will show up here.',
          builder: (page) {
            return ListView.separated(
              itemCount: page.items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final item = page.items[index];
                return ListTile(
                  leading: Icon(
                    item.unread ? Icons.notifications_active_outlined : Icons.notifications_none,
                  ),
                  title: Text(item.title),
                  subtitle: Text(item.body ?? item.eventType),
                  onTap: () async {
                    await ref.read(notificationsApiProvider).markRead(item.id);
                    if (!context.mounted) {
                      return;
                    }
                    final location = locationForNotification(
                      resourceType: item.resourceType,
                      resourceId: item.resourceId,
                    );
                    if (location != null && location != AppRoutes.notifications) {
                      context.push(location);
                    }
                    await ref.read(notificationInboxProvider.notifier).refresh();
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
