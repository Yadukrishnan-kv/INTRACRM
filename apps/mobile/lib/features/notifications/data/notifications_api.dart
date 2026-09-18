import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';

class InboxNotification {
  const InboxNotification({
    required this.id,
    required this.eventType,
    required this.title,
    required this.createdAt,
    this.body,
    this.resourceType,
    this.resourceId,
    this.readAt,
  });

  final String id;
  final String eventType;
  final String title;
  final String? body;
  final String? resourceType;
  final String? resourceId;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get unread => readAt == null;

  factory InboxNotification.fromJson(Map<String, dynamic> json) {
    return InboxNotification(
      id: json['id'] as String,
      eventType: json['eventType'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String?,
      resourceType: json['resourceType'] as String?,
      resourceId: json['resourceId'] as String?,
      readAt: DateTime.tryParse(json['readAt'] as String? ?? ''),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now().toUtc(),
    );
  }
}

class NotificationsApi {
  NotificationsApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<InboxNotification>>>> list({String? cursor}) {
    return _client.get(
      '/notifications',
      query: {'limit': 20, if (cursor != null) 'cursor': cursor},
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) InboxNotification.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<InboxNotification>>> markRead(String id) {
    return _client.post(
      '/notifications/$id/read',
      parse: (json) => InboxNotification.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<NotificationPreference>>>> preferences() {
    return _client.get(
      '/notifications/preferences',
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) NotificationPreference.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<NotificationPreference>>> updatePreference({
    required String eventType,
    required bool inAppEnabled,
    required bool pushEnabled,
  }) {
    return _client.put(
      '/notifications/preferences',
      data: {
        'eventType': eventType,
        'inAppEnabled': inAppEnabled,
        'pushEnabled': pushEnabled,
      },
      parse: (json) => NotificationPreference.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<void>>> registerDevice({
    required String deviceId,
    required String platform,
    required String token,
  }) {
    return _client.post(
      '/notifications/devices',
      data: {
        'deviceId': deviceId,
        'platform': platform,
        'token': token,
      },
      parse: (_) {},
    );
  }

  Future<Result<ApiSuccess<void>>> revokeDevice(String deviceId) {
    return _client.delete(
      '/notifications/devices/$deviceId',
      parse: (_) {},
    );
  }
}

class NotificationPreference {
  const NotificationPreference({
    required this.eventType,
    required this.name,
    required this.description,
    required this.inAppEnabled,
    required this.pushEnabled,
    this.resourceType,
  });

  final String eventType;
  final String name;
  final String description;
  final String? resourceType;
  final bool inAppEnabled;
  final bool pushEnabled;

  factory NotificationPreference.fromJson(Map<String, dynamic> json) {
    return NotificationPreference(
      eventType: json['eventType'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      resourceType: json['resourceType'] as String?,
      inAppEnabled: json['inAppEnabled'] as bool? ?? true,
      pushEnabled: json['pushEnabled'] as bool? ?? true,
    );
  }
}
