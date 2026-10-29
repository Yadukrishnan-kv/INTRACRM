import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../reports/domain/report_date_range.dart';
import '../domain/analytics.dart';
import '../domain/funnel_report.dart';

class AnalyticsApi {
  AnalyticsApi(this._client);

  final ApiClient _client;

  /// Every endpoint here reads from/to as inclusive YYYY-MM-DD dates. A null
  /// range keeps the API default: the current month for the dashboards, every
  /// live lead for the funnel.
  static Map<String, String> _range(ReportDateRange? range) =>
      reportRangeQuery(range, ReportDateMode.ymd);

  Future<Result<ApiSuccess<AnalyticsDashboard>>> overview({ReportDateRange? range}) {
    return _client.get(
      '/analytics',
      query: _range(range),
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AnalyticsDashboard>>> mine({ReportDateRange? range}) {
    return _client.get(
      '/analytics/me',
      query: _range(range),
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AnalyticsDashboard>>> report({ReportDateRange? range}) {
    return _client.get(
      '/reports/analytics',
      query: _range(range),
      parse: (json) => AnalyticsDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<FunnelReport>>> funnel({ReportDateRange? range}) {
    return _client.get(
      '/analytics/funnel',
      query: _range(range),
      parse: (json) => FunnelReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<FunnelReport>>> mineFunnel({ReportDateRange? range}) {
    return _client.get(
      '/analytics/funnel/me',
      query: _range(range),
      parse: (json) => FunnelReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
