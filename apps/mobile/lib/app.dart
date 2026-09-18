import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/di/providers.dart';
import 'design_system/theme/app_theme.dart';
import 'features/notifications/application/notification_providers.dart';
import 'router/app_router.dart';

class IntraLeadsApp extends ConsumerWidget {
  const IntraLeadsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final flavor = ref.watch(appFlavorProvider);
    ref.listen<String?>(pushNavigationProvider, (previous, next) {
      if (next == null || next == previous) {
        return;
      }
      router.push(next);
      ref.read(pushNavigationProvider.notifier).state = null;
    });

    return MaterialApp.router(
      title: flavor.appName,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
