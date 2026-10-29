import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/rbac_models.dart';

class RbacApi {
  RbacApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<RbacRole>>>> listRoles() {
    return _client.get(
      '/roles',
      parse: (json) => _asMaps(json).map(RbacRole.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<RbacRole>>> createRole({
    required String code,
    required String name,
    String? description,
    List<String> permissionCodes = const [],
  }) {
    return _client.post(
      '/roles',
      data: {
        'code': code,
        'name': name,
        if (description != null && description.isNotEmpty) 'description': description,
        'permissionCodes': permissionCodes,
      },
      parse: (json) => RbacRole.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<RbacRole>>> getRole(String roleId) {
    return _client.get(
      '/roles/$roleId',
      parse: (json) => RbacRole.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `PATCH /roles/:roleId` — rename / re-describe a custom role.
  Future<Result<ApiSuccess<RbacRole>>> updateRole({
    required String roleId,
    String? name,
    String? description,
  }) {
    return _client.patch(
      '/roles/$roleId',
      data: {'name': ?name, 'description': ?description},
      parse: (json) => RbacRole.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Object?>>> deleteRole(String roleId) {
    return _client.delete('/roles/$roleId', parse: (json) => json);
  }

  /// `GET /permissions` — the full permission catalog.
  Future<Result<ApiSuccess<List<RbacPermission>>>> listPermissions() {
    return _client.get(
      '/permissions',
      parse: (json) => _asMaps(json).map(RbacPermission.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<RbacRole>>> replacePermissions({
    required String roleId,
    required List<String> permissionCodes,
  }) {
    return _client.put(
      '/roles/$roleId/permissions',
      data: {'permissionCodes': permissionCodes},
      parse: (json) => RbacRole.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PermissionMatrix>>> matrix() {
    return _client.get(
      '/rbac/matrix',
      parse: (json) => PermissionMatrix.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<RbacMembership>>>> listMemberships() {
    return _client.get(
      '/memberships',
      parse: (json) => _asMaps(json).map(RbacMembership.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<RbacMembership>>> assignUser({
    required String email,
    required String fullName,
    required List<String> roleIds,
    String? designation,
  }) {
    return _client.post(
      '/memberships',
      data: {
        'email': email,
        'fullName': fullName,
        'roleIds': roleIds,
        if (designation != null && designation.isNotEmpty) 'designation': designation,
      },
      parse: (json) => RbacMembership.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<RbacMembership>>> assignRoles({
    required String membershipId,
    required List<String> roleIds,
  }) {
    return _client.put(
      '/memberships/$membershipId/roles',
      data: {'roleIds': roleIds},
      parse: (json) => RbacMembership.fromJson(json! as Map<String, dynamic>),
    );
  }

  List<Map<String, dynamic>> _asMaps(Object? json) {
    if (json is! List) {
      return const [];
    }
    return json
        .whereType<Map<dynamic, dynamic>>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
