import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/dashboard.dart';

class DashboardApi {
  DashboardApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<DashboardOverview>>> overview() {
    return _client.get(
      '/dashboard',
      parse: (json) => DashboardOverview.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<DashboardOverview>>> report() {
    return _client.get(
      '/reports/dashboard',
      parse: (json) => DashboardOverview.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffDashboard>>> mine() {
    return _client.get(
      '/dashboard/me',
      parse: (json) => StaffDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }
}
