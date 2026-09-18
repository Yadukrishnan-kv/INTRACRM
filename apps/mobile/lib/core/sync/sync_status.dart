enum SyncStatus {
  synced,
  pending,
  conflict;

  static SyncStatus parse(String? value) {
    return SyncStatus.values.asNameMap()[value] ?? SyncStatus.synced;
  }
}

class SyncResource {
  static const lead = 'lead';
  static const note = 'note';
  static const followUp = 'follow_up';
}

class OfflineConflict {
  const OfflineConflict({
    required this.id,
    required this.tenantId,
    required this.resourceType,
    required this.localId,
    required this.createdAt,
    this.serverId,
    this.localPayload = const {},
    this.serverPayload = const {},
    this.mergedPayload = const {},
    this.status = 'open',
  });

  final String id;
  final String tenantId;
  final String resourceType;
  final String localId;
  final String? serverId;
  final Map<String, dynamic> localPayload;
  final Map<String, dynamic> serverPayload;
  final Map<String, dynamic> mergedPayload;
  final String status;
  final DateTime createdAt;

  String get title {
    final name =
        mergedPayload['title'] ??
        localPayload['title'] ??
        serverPayload['title'] ??
        localId;
    return '$resourceType · $name';
  }
}
