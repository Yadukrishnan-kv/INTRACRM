class DeviceIntegrity {
  const DeviceIntegrity({
    required this.rooted,
    required this.jailbroken,
    this.emulator = false,
  });

  const DeviceIntegrity.trusted()
    : rooted = false,
      jailbroken = false,
      emulator = false;

  final bool rooted;
  final bool jailbroken;
  final bool emulator;

  bool get compromised => rooted || jailbroken;
}

bool shouldBlockCompromisedDevice({
  required bool enforce,
  required DeviceIntegrity integrity,
}) {
  return enforce && integrity.compromised;
}
