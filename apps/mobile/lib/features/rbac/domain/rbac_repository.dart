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
