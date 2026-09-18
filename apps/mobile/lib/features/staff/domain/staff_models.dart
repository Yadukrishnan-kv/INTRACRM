class StaffMember {
  const StaffMember({
    required this.id,
    required this.status,
    required this.active,
    required this.fullName,
    required this.roles,
    required this.teams,
    this.email,
    this.designation,
    this.employeeCode,
    this.userId,
  });

  final String id;
  final String status;
  final bool active;
  final String fullName;
  final String? email;
  final String? designation;
  final String? employeeCode;
  final String? userId;
  final List<StaffRef> roles;
  final List<StaffRef> teams;

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? const {};
    return StaffMember(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'active',
      active: json['active'] as bool? ?? json['status'] == 'active',
      fullName: user['fullName'] as String? ?? '',
      email: user['email'] as String?,
      userId: user['id'] as String?,
      designation: json['designation'] as String?,
      employeeCode: json['employeeCode'] as String?,
      roles: _refs(json['roles']),
      teams: _refs(json['teams']),
    );
  }
}

class StaffRef {
  const StaffRef({required this.id, required this.name, this.code});

  final String id;
  final String name;
  final String? code;

  factory StaffRef.fromJson(Map<String, dynamic> json) {
    return StaffRef(
      id: json['id'] as String,
      name: json['name'] as String? ?? json['code'] as String? ?? '',
      code: json['code'] as String?,
    );
  }
}

class StaffTeam {
  const StaffTeam({
    required this.id,
    required this.code,
    required this.name,
    required this.isActive,
    required this.memberCount,
    this.members = const [],
  });

  final String id;
  final String code;
  final String name;
  final bool isActive;
  final int memberCount;
  final List<StaffRef> members;

  factory StaffTeam.fromJson(Map<String, dynamic> json) {
    final members = json['members'];
    return StaffTeam(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      isActive: json['isActive'] as bool? ?? true,
      memberCount: json['memberCount'] as int? ?? 0,
      members: members is List
          ? members
                .whereType<Map<dynamic, dynamic>>()
                .map(
                  (item) => StaffRef(
                    id: item['id'] as String,
                    name: item['fullName'] as String? ?? '',
                    code: item['status'] as String?,
                  ),
                )
                .toList()
          : const [],
    );
  }
}

class StaffReport {
  const StaffReport({
    required this.totals,
    required this.byRole,
    required this.byTeam,
    required this.unassignedTeam,
    required this.roster,
  });

  final StaffReportTotals totals;
  final List<StaffReportBucket> byRole;
  final List<StaffReportBucket> byTeam;
  final int unassignedTeam;
  final List<StaffReportRow> roster;

  factory StaffReport.fromJson(Map<String, dynamic> json) {
    return StaffReport(
      totals: StaffReportTotals.fromJson(
        json['totals'] as Map<String, dynamic>? ?? const {},
      ),
      byRole: _buckets(json['byRole'], nameKey: 'roleName'),
      byTeam: _buckets(json['byTeam'], nameKey: 'teamName'),
      unassignedTeam: json['unassignedTeam'] as int? ?? 0,
      roster: (json['roster'] as List? ?? const [])
          .whereType<Map<dynamic, dynamic>>()
          .map((item) => StaffReportRow.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}

class StaffReportTotals {
  const StaffReportTotals({
    required this.total,
    required this.active,
    required this.inactive,
    required this.invited,
  });

  final int total;
  final int active;
  final int inactive;
  final int invited;

  factory StaffReportTotals.fromJson(Map<String, dynamic> json) {
    return StaffReportTotals(
      total: json['total'] as int? ?? 0,
      active: json['active'] as int? ?? 0,
      inactive: json['inactive'] as int? ?? 0,
      invited: json['invited'] as int? ?? 0,
    );
  }
}

class StaffReportBucket {
  const StaffReportBucket({required this.name, required this.count});

  final String name;
  final int count;
}

class StaffReportRow {
  const StaffReportRow({
    required this.id,
    required this.fullName,
    required this.status,
    required this.active,
    required this.roles,
    required this.teams,
    this.email,
    this.designation,
  });

  final String id;
  final String fullName;
  final String? email;
  final String status;
  final bool active;
  final String? designation;
  final List<String> roles;
  final List<String> teams;

  factory StaffReportRow.fromJson(Map<String, dynamic> json) {
    return StaffReportRow(
      id: json['id'] as String,
      fullName: json['fullName'] as String? ?? '',
      email: json['email'] as String?,
      status: json['status'] as String? ?? '',
      active: json['active'] as bool? ?? false,
      designation: json['designation'] as String?,
      roles: (json['roles'] as List? ?? const []).whereType<String>().toList(),
      teams: (json['teams'] as List? ?? const []).whereType<String>().toList(),
    );
  }
}

List<StaffRef> _refs(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value
      .whereType<Map<dynamic, dynamic>>()
      .map((item) => StaffRef.fromJson(Map<String, dynamic>.from(item)))
      .toList();
}

List<StaffReportBucket> _buckets(Object? value, {required String nameKey}) {
  if (value is! List) {
    return const [];
  }
  return value.whereType<Map<dynamic, dynamic>>().map((item) {
    return StaffReportBucket(
      name: item[nameKey] as String? ?? '',
      count: item['count'] as int? ?? 0,
    );
  }).toList();
}
