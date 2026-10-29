import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../reports/domain/report_date_range.dart';
import '../domain/track_report.dart';
import '../domain/track_row.dart';

class TracksApi {
  TracksApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<TrackReport>>> report({ReportDateRange? range}) {
    return _client.get(
      '/reports/tracks',
      query: reportRangeQuery(range, ReportDateMode.instant),
      parse: (json) => TrackReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// Audit trail for one lead (`audit:read`), cursor-paginated.
  Future<Result<ApiSuccess<List<TrackRow>>>> leadTracks(
    String leadId, {
    String? cursor,
  }) {
    return _client.get(
      '/leads/$leadId/tracks',
      query: {'cursor': ?cursor, 'limit': 50},
      parse: (json) => [
        for (final item in json as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TrackRow.fromJson(item),
      ],
    );
  }
}
