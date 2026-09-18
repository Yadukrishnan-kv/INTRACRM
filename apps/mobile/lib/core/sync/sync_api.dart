import '../network/api_client.dart';
import '../network/api_envelope.dart';
import '../error/result.dart';
import '../../features/leads/data/lead_dto.dart';

class SyncDelta {
  const SyncDelta({
    required this.leads,
    required this.notes,
    required this.followUps,
    this.cursor,
    this.updatedSince,
    this.hasMore = false,
  });

  final List<LeadDto> leads;
  final List<LeadActivityDto> notes;
  final List<LeadFollowUpDto> followUps;
  final String? cursor;
  final String? updatedSince;
  final bool hasMore;
}

class SyncApi {
  SyncApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<SyncDelta>>> pull({String? updatedSince, int limit = 100}) {
    return _client.get(
      '/sync',
      query: {
        'limit': limit,
        if (updatedSince != null) 'updatedSince': updatedSince,
      },
      parse: (json) {
        final map = json! as Map<String, dynamic>;
        return SyncDelta(
          cursor: map['cursor'] as String?,
          updatedSince: map['updatedSince'] as String?,
          hasMore: map['hasMore'] as bool? ?? false,
          leads: [
            for (final item in map['leads'] as List? ?? const [])
              if (item is Map<String, dynamic>) LeadDto.fromJson(item),
          ],
          notes: [
            for (final item in map['notes'] as List? ?? const [])
              if (item is Map<String, dynamic>) LeadActivityDto.fromJson(item),
          ],
          followUps: [
            for (final item in map['followUps'] as List? ?? const [])
              if (item is Map<String, dynamic>) LeadFollowUpDto.fromJson(item),
          ],
        );
      },
    );
  }
}
