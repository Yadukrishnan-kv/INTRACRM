class FollowUpReport {
  const FollowUpReport({
    required this.generatedAt,
    required this.totals,
    this.byStatus = const [],
    this.byType = const [],
    this.byAssignee = const [],
  });

  final DateTime generatedAt;
  final FollowUpReportTotals totals;
  final List<FollowUpStatusRow> byStatus;
  final List<FollowUpTypeRow> byType;
  final List<FollowUpAssigneeRow> byAssignee;

  factory FollowUpReport.fromJson(Map<String, dynamic> json) {
    return FollowUpReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: FollowUpReportTotals.fromJson(
        json['totals'] as Map<String, dynamic>? ?? const {},
      ),
      byStatus: [
        for (final item in json['byStatus'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) FollowUpStatusRow.fromJson(item),
      ],
      byType: [
        for (final item in json['byType'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) FollowUpTypeRow.fromJson(item),
      ],
      byAssignee: [
        for (final item in json['byAssignee'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) FollowUpAssigneeRow.fromJson(item),
      ],
    );
  }
}

class FollowUpReportTotals {
  const FollowUpReportTotals({
    required this.total,
    required this.pending,
    required this.completed,
    this.cancelled = 0,
    this.skipped = 0,
    this.overdue = 0,
    this.today = 0,
    this.upcoming = 0,
    this.rescheduled = 0,
    this.completionRateBps,
  });

  final int total;
  final int pending;
  final int completed;
  final int cancelled;
  final int skipped;
  final int overdue;
  final int today;
  final int upcoming;
  final int rescheduled;
  final int? completionRateBps;

  factory FollowUpReportTotals.fromJson(Map<String, dynamic> json) {
    return FollowUpReportTotals(
      total: json['total'] as int? ?? 0,
      pending: json['pending'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      cancelled: json['cancelled'] as int? ?? 0,
      skipped: json['skipped'] as int? ?? 0,
      overdue: json['overdue'] as int? ?? 0,
      today: json['today'] as int? ?? 0,
      upcoming: json['upcoming'] as int? ?? 0,
      rescheduled: json['rescheduled'] as int? ?? 0,
      completionRateBps: json['completionRateBps'] as int?,
    );
  }
}

class FollowUpStatusRow {
  const FollowUpStatusRow({required this.status, required this.count});

  final String status;
  final int count;

  factory FollowUpStatusRow.fromJson(Map<String, dynamic> json) {
    return FollowUpStatusRow(
      status: json['status'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}

class FollowUpTypeRow {
  const FollowUpTypeRow({required this.type, required this.count, this.completed = 0});

  final String type;
  final int count;
  final int completed;

  factory FollowUpTypeRow.fromJson(Map<String, dynamic> json) {
    return FollowUpTypeRow(
      type: json['type'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
    );
  }
}

class FollowUpAssigneeRow {
  const FollowUpAssigneeRow({
    required this.membershipId,
    this.name,
    required this.total,
    this.pending = 0,
    this.completed = 0,
    this.overdue = 0,
  });

  final String membershipId;
  final String? name;
  final int total;
  final int pending;
  final int completed;
  final int overdue;

  factory FollowUpAssigneeRow.fromJson(Map<String, dynamic> json) {
    return FollowUpAssigneeRow(
      membershipId: json['membershipId'] as String? ?? '',
      name: json['name'] as String?,
      total: json['total'] as int? ?? 0,
      pending: json['pending'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      overdue: json['overdue'] as int? ?? 0,
    );
  }
}
