import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';

class ReportExportApi {
  ReportExportApi(this._client);

  final ApiClient _client;

  Future<Result<List<int>>> download({
    required String dataset,
    required String format,
    String? periodType,
  }) {
    return _client.getBytes(
      '/reports/$dataset/export',
      query: {
        'format': format,
        if (periodType != null) 'periodType': periodType,
      },
    );
  }
}
