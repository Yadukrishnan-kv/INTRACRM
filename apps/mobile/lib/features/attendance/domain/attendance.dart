class AttendanceGeo {
  const AttendanceGeo({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;

  factory AttendanceGeo.fromJson(Map<String, dynamic> json) {
    return AttendanceGeo(
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      accuracyMeters: (json['accuracyMeters'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      if (accuracyMeters != null) 'accuracyMeters': accuracyMeters,
    };
  }

  String get label => '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}';
}

class AttendanceSession {
  const AttendanceSession({
    required this.id,
    required this.membershipId,
    required this.workDate,
    required this.punchedInAt,
    required this.minutesWorked,
    required this.status,
    required this.version,
    this.staffName,
    this.punchedOutAt,
    this.inLocation,
    this.outLocation,
    this.notes,
  });

  final String id;
  final String membershipId;
  final String? staffName;
  final String workDate;
  final DateTime punchedInAt;
  final DateTime? punchedOutAt;
  final AttendanceGeo? inLocation;
  final AttendanceGeo? outLocation;
  final int minutesWorked;
  final String status;
  final String? notes;
  final int version;

  bool get isOpen => status == 'open';

  factory AttendanceSession.fromJson(Map<String, dynamic> json) {
    final inLocation = json['inLocation'];
    final outLocation = json['outLocation'];
    return AttendanceSession(
      id: json['id'] as String? ?? '',
      membershipId: json['membershipId'] as String? ?? '',
      staffName: json['staffName'] as String?,
      workDate: json['workDate'] as String? ?? '',
      punchedInAt: DateTime.tryParse(json['punchedInAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      punchedOutAt: DateTime.tryParse(json['punchedOutAt'] as String? ?? ''),
      inLocation: inLocation is Map<String, dynamic> ? AttendanceGeo.fromJson(inLocation) : null,
      outLocation: outLocation is Map<String, dynamic> ? AttendanceGeo.fromJson(outLocation) : null,
      minutesWorked: json['minutesWorked'] as int? ?? 0,
      status: json['status'] as String? ?? 'closed',
      notes: json['notes'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }
}

class AttendanceDay {
  const AttendanceDay({
    required this.date,
    required this.membershipId,
    required this.minutesWorked,
    required this.status,
    this.staffName,
    this.firstInAt,
    this.lastOutAt,
    this.sessions = const [],
  });

  final String date;
  final String membershipId;
  final String? staffName;
  final DateTime? firstInAt;
  final DateTime? lastOutAt;
  final int minutesWorked;
  final String status;
  final List<AttendanceSession> sessions;

  factory AttendanceDay.fromJson(Map<String, dynamic> json) {
    final sessions = json['sessions'] as List<dynamic>? ?? const [];
    return AttendanceDay(
      date: json['date'] as String? ?? '',
      membershipId: json['membershipId'] as String? ?? '',
      staffName: json['staffName'] as String?,
      firstInAt: DateTime.tryParse(json['firstInAt'] as String? ?? ''),
      lastOutAt: DateTime.tryParse(json['lastOutAt'] as String? ?? ''),
      minutesWorked: json['minutesWorked'] as int? ?? 0,
      status: json['status'] as String? ?? 'absent',
      sessions: [
        for (final item in sessions)
          if (item is Map<String, dynamic>) AttendanceSession.fromJson(item),
      ],
    );
  }
}

class AttendanceToday {
  const AttendanceToday({
    required this.timezone,
    required this.lateAfter,
    required this.today,
    this.open,
  });

  final String timezone;
  final String lateAfter;
  final AttendanceSession? open;
  final AttendanceDay today;

  factory AttendanceToday.fromJson(Map<String, dynamic> json) {
    final open = json['open'];
    return AttendanceToday(
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      lateAfter: json['lateAfter'] as String? ?? '10:15',
      open: open is Map<String, dynamic> ? AttendanceSession.fromJson(open) : null,
      today: AttendanceDay.fromJson(json['today'] as Map<String, dynamic>? ?? const {}),
    );
  }
}

class AttendanceDaysPage {
  const AttendanceDaysPage({
    required this.timezone,
    required this.lateAfter,
    required this.from,
    required this.to,
    required this.items,
  });

  final String timezone;
  final String lateAfter;
  final String from;
  final String to;
  final List<AttendanceDay> items;

  factory AttendanceDaysPage.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    return AttendanceDaysPage(
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      lateAfter: json['lateAfter'] as String? ?? '10:15',
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
      items: [
        for (final item in items)
          if (item is Map<String, dynamic>) AttendanceDay.fromJson(item),
      ],
    );
  }
}

class AttendanceStaffRow {
  const AttendanceStaffRow({
    required this.membershipId,
    required this.presentDays,
    required this.lateDays,
    required this.openNow,
    required this.minutesWorked,
    this.name,
  });

  final String membershipId;
  final String? name;
  final int presentDays;
  final int lateDays;
  final int openNow;
  final int minutesWorked;

  factory AttendanceStaffRow.fromJson(Map<String, dynamic> json) {
    return AttendanceStaffRow(
      membershipId: json['membershipId'] as String? ?? '',
      name: json['name'] as String?,
      presentDays: json['presentDays'] as int? ?? 0,
      lateDays: json['lateDays'] as int? ?? 0,
      openNow: json['openNow'] as int? ?? 0,
      minutesWorked: json['minutesWorked'] as int? ?? 0,
    );
  }
}

class AttendanceDayRow {
  const AttendanceDayRow({
    required this.date,
    required this.present,
    required this.late,
    required this.open,
  });

  final String date;
  final int present;
  final int late;
  final int open;

  factory AttendanceDayRow.fromJson(Map<String, dynamic> json) {
    return AttendanceDayRow(
      date: json['date'] as String? ?? '',
      present: json['present'] as int? ?? 0,
      late: json['late'] as int? ?? 0,
      open: json['open'] as int? ?? 0,
    );
  }
}

class AttendanceReport {
  const AttendanceReport({
    required this.generatedAt,
    required this.from,
    required this.to,
    required this.timezone,
    required this.lateAfter,
    required this.presentDays,
    required this.lateDays,
    required this.openNow,
    required this.hoursWorked,
    required this.staffCount,
    this.byStaff = const [],
    this.byDay = const [],
  });

  final String generatedAt;
  final String from;
  final String to;
  final String timezone;
  final String lateAfter;
  final int presentDays;
  final int lateDays;
  final int openNow;
  final double hoursWorked;
  final int staffCount;
  final List<AttendanceStaffRow> byStaff;
  final List<AttendanceDayRow> byDay;

  factory AttendanceReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    final byStaff = json['byStaff'] as List<dynamic>? ?? const [];
    final byDay = json['byDay'] as List<dynamic>? ?? const [];
    return AttendanceReport(
      generatedAt: json['generatedAt'] as String? ?? '',
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      lateAfter: json['lateAfter'] as String? ?? '10:15',
      presentDays: totals['presentDays'] as int? ?? 0,
      lateDays: totals['lateDays'] as int? ?? 0,
      openNow: totals['openNow'] as int? ?? 0,
      hoursWorked: (totals['hoursWorked'] as num?)?.toDouble() ?? 0,
      staffCount: totals['staffCount'] as int? ?? 0,
      byStaff: [
        for (final item in byStaff)
          if (item is Map<String, dynamic>) AttendanceStaffRow.fromJson(item),
      ],
      byDay: [
        for (final item in byDay)
          if (item is Map<String, dynamic>) AttendanceDayRow.fromJson(item),
      ],
    );
  }
}

class AttendanceStatuses {
  static String title(String code) {
    return switch (code) {
      'present' => 'Present',
      'late' => 'Late',
      'open' => 'Punched in',
      'absent' => 'Absent',
      'closed' => 'Closed',
      _ => code,
    };
  }
}

String formatMinutes(int minutes) {
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) {
    return '${rest}m';
  }
  return '${hours}h ${rest}m';
}
