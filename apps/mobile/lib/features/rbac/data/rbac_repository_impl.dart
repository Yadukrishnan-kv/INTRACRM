import '../../../core/error/result.dart';
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

  Result<T> _unwrap<T>(Result<dynamic> result) {
    return switch (result) {
      Success(:final value) => Success(value.data as T),
      Err(:final failure) => Err(failure),
    };
  }
}
