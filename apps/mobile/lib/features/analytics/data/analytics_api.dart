import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/analytics.dart';
import '../domain/funnel_report.dart';

class AnalyticsApi {
  AnalyticsApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<AnalyticsDashboard>>> overview() {
    return _client.get(
      '/analytics',
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AnalyticsDashboard>>> mine() {
    return _client.get(
      '/analytics/me',
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AnalyticsDashboard>>> report() {
    return _client.get(
      '/reports/analytics',
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<FunnelReport>>> funnel() {
    return _client.get(
      '/analytics/funnel',
      parse: (json) => FunnelReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<FunnelReport>>> mineFunnel() {
    return _client.get(
      '/analytics/funnel/me',
      parse: (json) => FunnelReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
