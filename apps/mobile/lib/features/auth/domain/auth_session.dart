class AuthSession {
  const AuthSession({
    required this.id,
    required this.deviceId,
    required this.status,
    required this.lastSeenAt,
    required this.createdAt,
    required this.isCurrent,
    this.deviceName,
    this.ipAddress,
    this.userAgent,
  });

  final String id;
  final String deviceId;
  final String? deviceName;
  final String? ipAddress;
  final String? userAgent;
  final String status;
  final DateTime lastSeenAt;
  final DateTime createdAt;
  final bool isCurrent;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      id: json['id'] as String,
      deviceId: json['deviceId'] as String,
      deviceName: json['deviceName'] as String?,
      ipAddress: json['ipAddress'] as String?,
      userAgent: json['userAgent'] as String?,
      status: json['status'] as String? ?? 'unknown',
      lastSeenAt:
          DateTime.tryParse(json['lastSeenAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      isCurrent: json['isCurrent'] as bool? ?? false,
    );
  }
}

class LoginHistoryEntry {
  const LoginHistoryEntry({
    required this.id,
    required this.result,
    required this.createdAt,
    this.deviceName,
    this.ipAddress,
    this.failureReason,
  });

  final String id;
  final String result;
  final String? deviceName;
  final String? ipAddress;
  final DateTime createdAt;
  final String? failureReason;

  factory LoginHistoryEntry.fromJson(Map<String, dynamic> json) {
    return LoginHistoryEntry(
      id: json['id'] as String,
      result: json['result'] as String? ?? 'unknown',
      deviceName: json['deviceName'] as String?,
      ipAddress: json['ipAddress'] as String?,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      failureReason: json['failureReason'] as String?,
    );
  }
}
