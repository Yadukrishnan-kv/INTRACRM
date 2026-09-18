import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/pipeline_models.dart';

class PipelineApi {
  PipelineApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<PipelineBoard>>> board() {
    return _client.get(
      '/pipelines/board',
      parse: (json) => PipelineBoard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PipelineAnalytics>>> analytics() {
    return _client.get(
      '/reports/pipeline',
      parse: (json) => PipelineAnalytics.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<StageChange>>>> history(String leadId) {
    return _client.get(
      '/leads/$leadId/stage-changes',
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) StageChange.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<PipelineCard>>> changeStage({
    required String leadId,
    required String stageId,
    required int version,
    String? lostReasonId,
    String? reason,
  }) {
    return _client.post(
      '/leads/$leadId/stage-changes',
      data: {
        'stageId': stageId,
        'version': version,
        if (lostReasonId != null) 'lostReasonId': lostReasonId,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      parse: (json) => PipelineCard.fromJson(json! as Map<String, dynamic>),
    );
  }
}
