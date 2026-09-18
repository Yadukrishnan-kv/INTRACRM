import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/performance.dart';

class PerformanceApi {
  PerformanceApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<PerformanceCatalog>>> catalog() {
    return _client.get(
      '/performance/catalog',
      parse: (json) => PerformanceCatalog.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PerformanceBoard>>> leaderboard({
    String periodType = 'monthly',
    String? teamId,
  }) {
    return _client.get(
      '/performance/leaderboard',
      query: {
        'periodType': periodType,
        if (teamId != null) 'teamId': teamId,
        'limit': 100,
      },
      parse: (json) => PerformanceBoard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PerformanceCard>>> me({String periodType = 'monthly'}) {
    return _client.get(
      '/performance/me',
      query: {'periodType': periodType},
      parse: (json) => PerformanceCard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PerformanceCard>>> getById(
    String membershipId, {
    String periodType = 'monthly',
  }) {
    return _client.get(
      '/performance/$membershipId',
      query: {'periodType': periodType},
      parse: (json) => PerformanceCard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PerformanceReport>>> report({String periodType = 'monthly'}) {
    return _client.get(
      '/reports/performance',
      query: {'periodType': periodType},
      parse: (json) => PerformanceReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
