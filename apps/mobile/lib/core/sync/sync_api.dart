import '../../features/leads/data/lead_dto.dart';
import '../error/result.dart';
import '../network/api_client.dart';
import '../network/api_envelope.dart';

class SyncDelta {
  const SyncDelta({
    required this.leads,
    required this.notes,
    required this.followUps,
    this.cursor,
    this.updatedSince,
    this.hasMore = false,
    this.deletedLeads = const [],
    this.deletedNotes = const [],
    this.deletedFollowUps = const [],
  });

  final List<LeadDto> leads;
  final List<LeadActivityDto> notes;
  final List<LeadFollowUpDto> followUps;
  final String? cursor;
  final String? updatedSince;
  final bool hasMore;
  final List<String> deletedLeads;
  final List<String> deletedNotes;
  final List<String> deletedFollowUps;

  factory SyncDelta.fromJson(Map<String, dynamic> map) {
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
      deletedLeads: _ids(map['deletedLeads']),
      deletedNotes: _ids(map['deletedNotes']),
      deletedFollowUps: _ids(map['deletedFollowUps']),
    );
  }

  static List<String> _ids(Object? value) => [
    for (final item in value as List? ?? const [])
      if (item is String && item.isNotEmpty) item,
  ];
}

class SyncApi {
  SyncApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<SyncDelta>>> pull({String? updatedSince, int limit = 100}) {
    return _client.get(
      '/sync',
      query: {
        'limit': limit,
        'updatedSince': ?updatedSince,
      },
      parse: (json) => SyncDelta.fromJson(json! as Map<String, dynamic>),
    );
  }
}
