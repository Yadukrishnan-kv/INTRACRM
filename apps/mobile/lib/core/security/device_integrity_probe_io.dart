import 'dart:io';

import 'package:safe_device/safe_device.dart';

import 'device_integrity.dart';
import 'device_integrity_probe.dart';

class IoDeviceIntegrityProbe implements DeviceIntegrityProbe {
  const IoDeviceIntegrityProbe();

  @override
  Future<DeviceIntegrity> check() async {
    if (!Platform.isAndroid && !Platform.isIOS) {
      return const DeviceIntegrity.trusted();
    }
    try {
      final jailbroken = await SafeDevice.isJailBroken;
      final realDevice = await SafeDevice.isRealDevice;
      return DeviceIntegrity(
        rooted: Platform.isAndroid && jailbroken,
        jailbroken: Platform.isIOS && jailbroken,
        emulator: !realDevice,
      );
    } catch (_) {
      return const DeviceIntegrity.trusted();
    }
  }
}

DeviceIntegrityProbe createDeviceIntegrityProbe() => const IoDeviceIntegrityProbe();
