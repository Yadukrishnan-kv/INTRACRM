import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../reports/domain/report_date_range.dart';
import '../domain/sales_board.dart';
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
        'cursor': ?cursor,
        'periodType': ?periodType,
        'scopeType': ?scopeType,
        'productId': ?productId,
        'teamId': ?teamId,
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

  /// `PATCH /targets/:id` (`target:manage`).
  Future<Result<ApiSuccess<Target>>> updateTarget(String id, Map<String, dynamic> data) {
    return _client.patch(
      '/targets/$id',
      data: data,
      parse: (json) => Target.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `DELETE /targets/:id` (`target:manage`).
  Future<Result<ApiSuccess<Object?>>> deleteTarget(String id) {
    return _client.delete('/targets/$id', parse: (json) => json);
  }

  Future<Result<ApiSuccess<SalesBoard>>> salesBoard({
    String? period,
    String? scope,
    String? metricCode,
  }) {
    return _client.get(
      '/targets/sales-board',
      query: {'period': ?period, 'scope': ?scope, 'metricCode': ?metricCode},
      parse: (json) => SalesBoard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<TargetReport>>> report({ReportDateRange? range}) {
    return _client.get(
      '/reports/targets',
      query: reportRangeQuery(range, ReportDateMode.ymd),
      parse: (json) => TargetReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
