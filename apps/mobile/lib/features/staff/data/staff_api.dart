import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/staff_models.dart';

class StaffApi {
  StaffApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<StaffMember>>>> listStaff({String? status}) {
    return _client.get(
      '/staff',
      query: {'status': ?status},
      parse: (json) => _maps(json).map(StaffMember.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<StaffMember>>> getStaff(String id) {
    return _client.get(
      '/staff/$id',
      parse: (json) => StaffMember.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffMember>>> createStaff({
    required String email,
    required String fullName,
    required List<String> roleIds,
    String? designation,
    String? employeeCode,
    List<String> teamIds = const [],
    String? password,
  }) {
    return _client.post(
      '/staff',
      data: {
        'email': email,
        'fullName': fullName,
        'roleIds': roleIds,
        if (designation != null && designation.isNotEmpty) 'designation': designation,
        if (employeeCode != null && employeeCode.isNotEmpty) 'employeeCode': employeeCode,
        'teamIds': teamIds,
        if (password != null && password.isNotEmpty) 'password': password,
      },
      parse: (json) => StaffMember.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffMember>>> updateStaff({
    required String id,
    String? fullName,
    String? email,
    String? designation,
    String? employeeCode,
    List<String>? roleIds,
    List<String>? teamIds,
  }) {
    return _client.patch(
      '/staff/$id',
      data: {
        'fullName': ?fullName,
        'email': ?email,
        'designation': ?designation,
        'employeeCode': ?employeeCode,
        'roleIds': ?roleIds,
        'teamIds': ?teamIds,
      },
      parse: (json) => StaffMember.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffMember>>> setActive({
    required String id,
    required bool active,
  }) {
    return _client.post(
      '/staff/$id/status',
      data: {'active': active},
      parse: (json) => StaffMember.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `DELETE /staff/:staffId` (`tenant:manage_users`) — removes the member
  /// from the workspace. The API rejects self-removal and non-founders
  /// removing a founder (403).
  Future<Result<ApiSuccess<Object?>>> removeStaff(String id) {
    return _client.delete('/staff/$id', parse: (json) => json);
  }

  /// `POST /staff/:staffId/password` (`tenant:manage_users`) — admin reset of
  /// another staff member's password. Signs them out of every device.
  Future<Result<ApiSuccess<Object?>>> resetPassword({
    required String id,
    required String newPassword,
  }) {
    return _client.post(
      '/staff/$id/password',
      data: {'newPassword': newPassword},
      parse: (json) => json,
    );
  }

  Future<Result<ApiSuccess<List<StaffTeam>>>> listTeams() {
    return _client.get(
      '/teams',
      parse: (json) => _maps(json).map(StaffTeam.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<StaffTeam>>> createTeam({
    required String code,
    required String name,
  }) {
    return _client.post(
      '/teams',
      data: {'code': code, 'name': name},
      parse: (json) => StaffTeam.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffTeam>>> updateTeam({
    required String teamId,
    String? name,
    bool? isActive,
  }) {
    return _client.patch(
      '/teams/$teamId',
      data: {
        'name': ?name,
        'isActive': ?isActive,
      },
      parse: (json) => StaffTeam.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Map<String, dynamic>>>> deleteTeam(String teamId) {
    return _client.delete(
      '/teams/$teamId',
      parse: (json) => json is Map<String, dynamic> ? json : {'deleted': true},
    );
  }

  Future<Result<ApiSuccess<StaffTeam>>> replaceTeamMembers({
    required String teamId,
    required List<String> membershipIds,
  }) {
    return _client.put(
      '/teams/$teamId/members',
      data: {'membershipIds': membershipIds},
      parse: (json) => StaffTeam.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<StaffReport>>> staffReport() {
    return _client.get(
      '/reports/staff',
      parse: (json) => StaffReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  List<Map<String, dynamic>> _maps(Object? json) {
    if (json is! List) {
      return const [];
    }
    return json
        .whereType<Map<dynamic, dynamic>>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
