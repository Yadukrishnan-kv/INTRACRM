import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/security/device_integrity.dart';

void main() {
  test('blocks rooted or jailbroken devices when enforcement is on', () {
    expect(
      shouldBlockCompromisedDevice(
        enforce: true,
        integrity: const DeviceIntegrity(rooted: true, jailbroken: false),
      ),
      isTrue,
    );
    expect(
      shouldBlockCompromisedDevice(
        enforce: true,
        integrity: const DeviceIntegrity(rooted: false, jailbroken: true),
      ),
      isTrue,
    );
    expect(
      shouldBlockCompromisedDevice(
        enforce: false,
        integrity: const DeviceIntegrity(rooted: true, jailbroken: true),
      ),
      isFalse,
    );
    expect(
      shouldBlockCompromisedDevice(
        enforce: true,
        integrity: const DeviceIntegrity.trusted(),
      ),
      isFalse,
    );
  });
}
