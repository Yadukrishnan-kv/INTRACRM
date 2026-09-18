class TrackReport {
  const TrackReport({
    required this.generatedAt,
    required this.totals,
    this.byAction = const [],
    this.byResource = const [],
    this.byActor = const [],
    this.byDay = const [],
  });

  final String generatedAt;
  final TrackReportTotals totals;
  final List<TrackNamedCount> byAction;
  final List<TrackNamedCount> byResource;
  final List<TrackActorRow> byActor;
  final List<TrackDayRow> byDay;

  factory TrackReport.fromJson(Map<String, dynamic> json) {
    return TrackReport(
      generatedAt: json['generatedAt'] as String? ?? '',
      totals: TrackReportTotals.fromJson(json['totals'] as Map<String, dynamic>? ?? const {}),
      byAction: [
        for (final item in json['byAction'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>)
            TrackNamedCount.fromJson(item, nameKey: 'name', codeKey: 'action'),
      ],
      byResource: [
        for (final item in json['byResource'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>)
            TrackNamedCount.fromJson(item, nameKey: 'resourceType', codeKey: 'resourceType'),
      ],
      byActor: [
        for (final item in json['byActor'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TrackActorRow.fromJson(item),
      ],
      byDay: [
        for (final item in json['byDay'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TrackDayRow.fromJson(item),
      ],
    );
  }
}

class TrackReportTotals {
  const TrackReportTotals({
    required this.total,
    required this.create,
    required this.update,
    required this.delete,
    required this.assign,
    required this.statusChange,
  });

  final int total;
  final int create;
  final int update;
  final int delete;
  final int assign;
  final int statusChange;

  factory TrackReportTotals.fromJson(Map<String, dynamic> json) {
    return TrackReportTotals(
      total: json['total'] as int? ?? 0,
      create: json['create'] as int? ?? 0,
      update: json['update'] as int? ?? 0,
      delete: json['delete'] as int? ?? 0,
      assign: json['assign'] as int? ?? 0,
      statusChange: json['statusChange'] as int? ?? 0,
    );
  }
}

class TrackNamedCount {
  const TrackNamedCount({required this.code, required this.name, required this.count});

  final String code;
  final String name;
  final int count;

  factory TrackNamedCount.fromJson(
    Map<String, dynamic> json, {
    required String nameKey,
    required String codeKey,
  }) {
    final code = json[codeKey] as String? ?? '';
    return TrackNamedCount(
      code: code,
      name: (json[nameKey] as String?) ?? code,
      count: json['count'] as int? ?? 0,
    );
  }
}

class TrackActorRow {
  const TrackActorRow({this.actorId, this.name, required this.count});

  final String? actorId;
  final String? name;
  final int count;

  factory TrackActorRow.fromJson(Map<String, dynamic> json) {
    return TrackActorRow(
      actorId: json['actorId'] as String?,
      name: json['name'] as String?,
      count: json['count'] as int? ?? 0,
    );
  }
}

class TrackDayRow {
  const TrackDayRow({required this.date, required this.count});

  final String date;
  final int count;

  factory TrackDayRow.fromJson(Map<String, dynamic> json) {
    return TrackDayRow(
      date: json['date'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}
