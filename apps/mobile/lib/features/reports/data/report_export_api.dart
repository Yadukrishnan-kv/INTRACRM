import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/report_date_range.dart';

class ReportExportApi {
  ReportExportApi(this._client);

  final ApiClient _client;

  Future<Result<List<int>>> download({
    required String dataset,
    required String format,
    String? periodType,
    ReportDateRange? range,
    ReportDateMode dateMode = ReportDateMode.instant,
  }) {
    return _client.getBytes(
      '/reports/$dataset/export',
      query: {
        'format': format,
        'periodType': ?periodType,
        ...reportRangeQuery(range, dateMode),
      },
    );
  }
}
