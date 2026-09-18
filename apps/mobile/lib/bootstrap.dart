import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';

import 'app.dart';
import 'core/di/providers.dart';
import 'features/auth/application/auth_controller.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) {
    databaseFactory = databaseFactoryFfiWeb;
  }

  final container = ProviderContainer();
  await container.read(localDatabaseProvider).init();
  await container.read(authControllerProvider.notifier).restoreSession();
  container.read(syncEngineProvider).start();
  await container.read(syncEngineProvider).syncNow();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const IntraLeadsApp(),
    ),
  );
}
