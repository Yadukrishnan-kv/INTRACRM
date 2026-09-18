import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../data/notifications_api.dart';
import 'push_notification_service.dart';

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return NotificationsApi(ref.watch(apiClientProvider));
});

final inboxRefreshTickProvider = StateProvider<int>((ref) => 0);

final pushNavigationProvider = StateProvider<String?>((ref) => null);

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  return PushNotificationService(
    tokens: ref.watch(tokenStoreProvider),
    api: ref.watch(notificationsApiProvider),
    onOpened: (location) {
      ref.read(pushNavigationProvider.notifier).state = location;
    },
    onForeground: () {
      ref.read(inboxRefreshTickProvider.notifier).update((value) => value + 1);
    },
  );
});
