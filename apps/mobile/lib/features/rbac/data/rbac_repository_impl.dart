import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/rbac_models.dart';
import '../domain/rbac_repository.dart';
import 'rbac_api.dart';

class RbacRepositoryImpl implements RbacRepository {
  RbacRepositoryImpl(this._api);

  final RbacApi _api;

  @override
  Future<Result<List<RbacRole>>> listRoles() async {
    return _unwrap(await _api.listRoles());
  }

  @override
  Future<Result<RbacRole>> createRole({
    required String code,
    required String name,
    String? description,
    List<String> permissionCodes = const [],
  }) async {
    return _unwrap(
      await _api.createRole(
        code: code,
        name: name,
        description: description,
        permissionCodes: permissionCodes,
      ),
    );
  }

  @override
  Future<Result<RbacRole>> getRole(String roleId) async {
    return _unwrap(await _api.getRole(roleId));
  }

  @override
  Future<Result<RbacRole>> updateRole({
    required String roleId,
    String? name,
    String? description,
  }) async {
    return _unwrap(
      await _api.updateRole(roleId: roleId, name: name, description: description),
    );
  }

  @override
  Future<Result<void>> deleteRole(String roleId) async {
    return switch (_unwrap(await _api.deleteRole(roleId))) {
      Success() => const Success(null),
      Err(:final failure) => Err(failure),
    };
  }

  @override
  Future<Result<List<RbacPermission>>> listPermissions() async {
    return _unwrap(await _api.listPermissions());
  }

  @override
  Future<Result<RbacRole>> replacePermissions({
    required String roleId,
    required List<String> permissionCodes,
  }) async {
    return _unwrap(
      await _api.replacePermissions(roleId: roleId, permissionCodes: permissionCodes),
    );
  }

  @override
  Future<Result<PermissionMatrix>> matrix() async {
    return _unwrap(await _api.matrix());
  }

  @override
  Future<Result<List<RbacMembership>>> listMemberships() async {
    return _unwrap(await _api.listMemberships());
  }

  @override
  Future<Result<RbacMembership>> assignUser({
    required String email,
    required String fullName,
    required List<String> roleIds,
    String? designation,
  }) async {
    return _unwrap(
      await _api.assignUser(
        email: email,
        fullName: fullName,
        roleIds: roleIds,
        designation: designation,
      ),
    );
  }

  @override
  Future<Result<RbacMembership>> assignRoles({
    required String membershipId,
    required List<String> roleIds,
  }) async {
    return _unwrap(
      await _api.assignRoles(membershipId: membershipId, roleIds: roleIds),
    );
  }

  Result<T> _unwrap<T>(Result<ApiSuccess<T>> result) => unwrapEnvelope(result);
}
