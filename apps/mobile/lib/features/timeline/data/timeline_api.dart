import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/timeline_models.dart';

class TimelineApi {
  TimelineApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<TimelineEvent>>>> list({
    String? cursor,
    String? leadId,
    String? eventCode,
  }) {
    return _client.get(
      leadId == null ? '/timeline' : '/leads/$leadId/timeline',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (eventCode != null) 'eventCode': eventCode,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) TimelineEvent.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<Map<String, dynamic>>>> addSiteVisit({
    required String leadId,
    required DateTime scheduledAt,
    String? purpose,
    String? city,
    String? notes,
  }) {
    return _client.post(
      '/leads/$leadId/site-visits',
      data: {
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (purpose != null && purpose.isNotEmpty) 'purpose': purpose,
        if (city != null && city.isNotEmpty) 'city': city,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => json! as Map<String, dynamic>,
    );
  }

  Future<Result<ApiSuccess<Map<String, dynamic>>>> sendQuotation({
    required String leadId,
    required int totalMinor,
    String? notes,
  }) {
    return _client.post(
      '/leads/$leadId/quotations',
      data: {
        'totalMinor': totalMinor,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => json! as Map<String, dynamic>,
    );
  }
}
