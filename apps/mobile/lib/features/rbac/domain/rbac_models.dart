class RbacPermission {
  const RbacPermission({
    required this.id,
    required this.code,
    required this.resource,
    required this.action,
    this.description,
  });

  final String id;
  final String code;
  final String resource;
  final String action;
  final String? description;

  factory RbacPermission.fromJson(Map<String, dynamic> json) {
    return RbacPermission(
      id: json['id'] as String,
      code: json['code'] as String,
      resource: json['resource'] as String? ?? '',
      action: json['action'] as String? ?? '',
      description: json['description'] as String?,
    );
  }
}

class RbacRole {
  const RbacRole({
    required this.id,
    required this.code,
    required this.name,
    required this.isSystem,
    required this.isDefault,
    required this.permissionCodes,
    this.description,
    this.tenantId,
  });

  final String id;
  final String code;
  final String name;
  final String? description;
  final bool isSystem;
  final bool isDefault;
  final String? tenantId;
  final List<String> permissionCodes;

  factory RbacRole.fromJson(Map<String, dynamic> json) {
    final codes = json['permissionCodes'];
    return RbacRole(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      isSystem: json['isSystem'] as bool? ?? false,
      isDefault: json['isDefault'] as bool? ?? false,
      tenantId: json['tenantId'] as String?,
      permissionCodes: codes is List ? codes.whereType<String>().toList() : const [],
    );
  }
}

class RbacMembership {
  const RbacMembership({
    required this.id,
    required this.status,
    required this.userId,
    required this.fullName,
    required this.roles,
    this.email,
    this.designation,
  });

  final String id;
  final String status;
  final String userId;
  final String fullName;
  final String? email;
  final String? designation;
  final List<RbacRoleRef> roles;

  factory RbacMembership.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? const {};
    final roles = json['roles'];
    return RbacMembership(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'active',
      userId: user['id'] as String? ?? '',
      fullName: user['fullName'] as String? ?? '',
      email: user['email'] as String?,
      designation: json['designation'] as String?,
      roles: roles is List
          ? roles
                .whereType<Map<dynamic, dynamic>>()
                .map((item) => RbacRoleRef.fromJson(Map<String, dynamic>.from(item)))
                .toList()
          : const [],
    );
  }
}

class RbacRoleRef {
  const RbacRoleRef({required this.id, required this.code, required this.name});

  final String id;
  final String code;
  final String name;

  factory RbacRoleRef.fromJson(Map<String, dynamic> json) {
    return RbacRoleRef(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
    );
  }
}

class PermissionMatrix {
  const PermissionMatrix({required this.permissions, required this.roles});

  final List<RbacPermission> permissions;
  final List<RbacRole> roles;

  factory PermissionMatrix.fromJson(Map<String, dynamic> json) {
    return PermissionMatrix(
      permissions: (json['permissions'] as List? ?? const [])
          .whereType<Map<dynamic, dynamic>>()
          .map((item) => RbacPermission.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      roles: (json['roles'] as List? ?? const [])
          .whereType<Map<dynamic, dynamic>>()
          .map((item) => RbacRole.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}
