import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/track_report.dart';

class TracksApi {
  TracksApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<TrackReport>>> report() {
    return _client.get(
      '/reports/tracks',
      parse: (json) => TrackReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
