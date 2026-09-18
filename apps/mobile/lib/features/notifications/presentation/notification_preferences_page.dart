import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../l10n/app_strings.dart';
import '../application/notification_providers.dart';
import '../data/notifications_api.dart';

final notificationPreferencesProvider =
    AsyncNotifierProvider<NotificationPreferencesController, Result<List<NotificationPreference>>>(
      NotificationPreferencesController.new,
    );

class NotificationPreferencesController
    extends AsyncNotifier<Result<List<NotificationPreference>>> {
  @override
  Future<Result<List<NotificationPreference>>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> setChannels({
    required String eventType,
    required bool inAppEnabled,
    required bool pushEnabled,
  }) async {
    final result = await ref.read(notificationsApiProvider).updatePreference(
      eventType: eventType,
      inAppEnabled: inAppEnabled,
      pushEnabled: pushEnabled,
    );
    if (result is Success) {
      await refresh();
    }
  }

  Future<Result<List<NotificationPreference>>> _load() async {
    final result = await ref.read(notificationsApiProvider).preferences();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

class NotificationPreferencesPage extends ConsumerWidget {
  const NotificationPreferencesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPreferencesProvider);
    return AppScaffold(
      title: AppStrings.notificationPreferences,
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationPreferencesProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: prefs,
          isEmpty: (items) => items.isEmpty,
          emptyTitle: AppStrings.notificationPreferences,
          emptyMessage: 'Lead, follow-up, and quotation alerts can be toggled here.',
          builder: (items) {
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final item = items[index];
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.name, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text(item.description),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('In-app'),
                        value: item.inAppEnabled,
                        onChanged: (value) {
                          ref.read(notificationPreferencesProvider.notifier).setChannels(
                            eventType: item.eventType,
                            inAppEnabled: value,
                            pushEnabled: item.pushEnabled,
                          );
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Push'),
                        value: item.pushEnabled,
                        onChanged: (value) {
                          ref.read(notificationPreferencesProvider.notifier).setChannels(
                            eventType: item.eventType,
                            inAppEnabled: item.inAppEnabled,
                            pushEnabled: value,
                          );
                        },
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
