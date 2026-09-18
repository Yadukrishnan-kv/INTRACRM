import 'package:flutter/widgets.dart';

import 'bootstrap.dart';
import 'core/config/app_env.dart';
import 'core/security/device_integrity.dart';
import 'core/security/device_integrity_factory.dart';
import 'features/security/presentation/compromised_device_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final flavor = AppFlavor.fromEnvironment();
  final integrity = await createDeviceIntegrityProbe().check();
  if (shouldBlockCompromisedDevice(
    enforce: flavor.enforceDeviceIntegrity,
    integrity: integrity,
  )) {
    runApp(CompromisedDeviceApp(integrity: integrity));
    return;
  }
  await bootstrap();
}
