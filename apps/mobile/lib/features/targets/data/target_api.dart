import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/target.dart';

class TargetApi {
  TargetApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<TargetCatalog>>> catalog() {
    return _client.get(
      '/targets/catalog',
      parse: (json) => TargetCatalog.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<TargetProgressDashboard>>> progress() {
    return _client.get(
      '/targets/progress',
      parse: (json) => TargetProgressDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<Target>>>> list({
    String? cursor,
    String? periodType,
    String? scopeType,
    String? productId,
    String? teamId,
    bool? hasProduct,
    bool? current,
  }) {
    return _client.get(
      '/targets',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (periodType != null) 'periodType': periodType,
        if (scopeType != null) 'scopeType': scopeType,
        if (productId != null) 'productId': productId,
        if (teamId != null) 'teamId': teamId,
        if (hasProduct == true) 'hasProduct': true,
        if (current == true) 'current': true,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) Target.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<Target>>> getById(String id) {
    return _client.get(
      '/targets/$id',
      parse: (json) => Target.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Target>>> create(Map<String, dynamic> data) {
    return _client.post(
      '/targets',
      data: data,
      parse: (json) => Target.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<TargetReport>>> report() {
    return _client.get(
      '/reports/targets',
      parse: (json) => TargetReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
