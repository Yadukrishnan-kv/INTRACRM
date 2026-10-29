import '../../../core/error/result.dart';
import 'rbac_models.dart';

abstract class RbacRepository {
  Future<Result<List<RbacRole>>> listRoles();

  Future<Result<RbacRole>> createRole({
    required String code,
    required String name,
    String? description,
    List<String> permissionCodes = const [],
  });

  Future<Result<RbacRole>> getRole(String roleId);

  Future<Result<RbacRole>> updateRole({
    required String roleId,
    String? name,
    String? description,
  });

  Future<Result<void>> deleteRole(String roleId);

  Future<Result<List<RbacPermission>>> listPermissions();

  Future<Result<RbacRole>> replacePermissions({
    required String roleId,
    required List<String> permissionCodes,
  });

  Future<Result<PermissionMatrix>> matrix();

  Future<Result<List<RbacMembership>>> listMemberships();

  Future<Result<RbacMembership>> assignUser({
    required String email,
    required String fullName,
    required List<String> roleIds,
    String? designation,
  });

  Future<Result<RbacMembership>> assignRoles({
    required String membershipId,
    required List<String> roleIds,
  });
}
