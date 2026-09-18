import 'device_integrity.dart';

abstract class DeviceIntegrityProbe {
  Future<DeviceIntegrity> check();
}

class TrustedDeviceIntegrityProbe implements DeviceIntegrityProbe {
  const TrustedDeviceIntegrityProbe();

  @override
  Future<DeviceIntegrity> check() async => const DeviceIntegrity.trusted();
}
