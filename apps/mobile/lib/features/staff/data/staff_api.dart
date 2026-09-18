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
      query: {if (status != null) 'status': status},
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
        if (fullName != null) 'fullName': fullName,
        if (email != null) 'email': email,
        if (designation != null) 'designation': designation,
        if (employeeCode != null) 'employeeCode': employeeCode,
        if (roleIds != null) 'roleIds': roleIds,
        if (teamIds != null) 'teamIds': teamIds,
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
        if (name != null) 'name': name,
        if (isActive != null) 'isActive': isActive,
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
