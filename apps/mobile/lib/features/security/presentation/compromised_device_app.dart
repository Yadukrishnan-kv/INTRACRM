import 'package:flutter/material.dart';

import '../../../core/security/device_integrity.dart';
import '../../../l10n/app_strings.dart';

class CompromisedDeviceApp extends StatelessWidget {
  const CompromisedDeviceApp({super.key, required this.integrity});

  final DeviceIntegrity integrity;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppStrings.appTitle,
      home: _CompromisedDevicePage(integrity: integrity),
    );
  }
}

class _CompromisedDevicePage extends StatelessWidget {
  const _CompromisedDevicePage({required this.integrity});

  final DeviceIntegrity integrity;

  @override
  Widget build(BuildContext context) {
    final reasons = [
      if (integrity.rooted) AppStrings.rootedDevice,
      if (integrity.jailbroken) AppStrings.jailbrokenDevice,
    ];
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.security, size: 56),
              const SizedBox(height: 16),
              Text(
                AppStrings.deviceNotTrusted,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              Text(
                reasons.isEmpty ? AppStrings.deviceIntegrityBlocked : reasons.join('\n'),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
