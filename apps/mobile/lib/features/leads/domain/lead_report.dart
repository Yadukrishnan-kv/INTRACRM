class LeadReport {
  const LeadReport({
    required this.generatedAt,
    required this.totals,
    this.byLifecycle = const [],
    this.byQuality = const [],
    this.bySource = const [],
    this.byOwner = const [],
    this.byStage = const [],
    this.byCity = const [],
  });

  final DateTime generatedAt;
  final LeadReportTotals totals;
  final List<LeadCountRow> byLifecycle;
  final List<LeadQualityRow> byQuality;
  final List<LeadSourceRow> bySource;
  final List<LeadOwnerRow> byOwner;
  final List<LeadStageRow> byStage;
  final List<LeadCityRow> byCity;

  factory LeadReport.fromJson(Map<String, dynamic> json) {
    return LeadReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: LeadReportTotals.fromJson(
        json['totals'] as Map<String, dynamic>? ?? const {},
      ),
      byLifecycle: [
        for (final item in json['byLifecycle'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadCountRow.fromJson(item),
      ],
      byQuality: [
        for (final item in json['byQuality'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadQualityRow.fromJson(item),
      ],
      bySource: [
        for (final item in json['bySource'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadSourceRow.fromJson(item),
      ],
      byOwner: [
        for (final item in json['byOwner'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadOwnerRow.fromJson(item),
      ],
      byStage: [
        for (final item in json['byStage'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadStageRow.fromJson(item),
      ],
      byCity: [
        for (final item in json['byCity'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) LeadCityRow.fromJson(item),
      ],
    );
  }
}

class LeadReportTotals {
  const LeadReportTotals({
    required this.total,
    required this.open,
    required this.won,
    required this.lost,
    this.unqualified = 0,
    this.recycled = 0,
    this.unassigned = 0,
    this.estimatedValueMinor = 0,
    this.wonValueMinor = 0,
    this.winRateBps,
  });

  final int total;
  final int open;
  final int won;
  final int lost;
  final int unqualified;
  final int recycled;
  final int unassigned;
  final int estimatedValueMinor;
  final int wonValueMinor;
  final int? winRateBps;

  factory LeadReportTotals.fromJson(Map<String, dynamic> json) {
    return LeadReportTotals(
      total: json['total'] as int? ?? 0,
      open: json['open'] as int? ?? 0,
      won: json['won'] as int? ?? 0,
      lost: json['lost'] as int? ?? 0,
      unqualified: json['unqualified'] as int? ?? 0,
      recycled: json['recycled'] as int? ?? 0,
      unassigned: json['unassigned'] as int? ?? 0,
      estimatedValueMinor: json['estimatedValueMinor'] as int? ?? 0,
      wonValueMinor: json['wonValueMinor'] as int? ?? 0,
      winRateBps: json['winRateBps'] as int?,
    );
  }
}

class LeadCountRow {
  const LeadCountRow({required this.status, required this.count, this.valueMinor = 0});

  final String status;
  final int count;
  final int valueMinor;

  factory LeadCountRow.fromJson(Map<String, dynamic> json) {
    return LeadCountRow(
      status: json['status'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
    );
  }

  String get title => switch (status) {
    'open' => 'Open',
    'won' => 'Won',
    'lost' => 'Lost',
    'unqualified' => 'Unqualified',
    'recycled' => 'Recycled',
    _ => status,
  };
}

class LeadQualityRow {
  const LeadQualityRow({required this.quality, required this.count});

  final String quality;
  final int count;

  factory LeadQualityRow.fromJson(Map<String, dynamic> json) {
    return LeadQualityRow(
      quality: json['quality'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }

  String get title => switch (quality) {
    'hot' => 'Hot',
    'warm' => 'Warm',
    'cold' => 'Cold',
    _ => quality,
  };
}

class LeadSourceRow {
  const LeadSourceRow({this.sourceId, this.name, required this.count, this.valueMinor = 0});

  final String? sourceId;
  final String? name;
  final int count;
  final int valueMinor;

  factory LeadSourceRow.fromJson(Map<String, dynamic> json) {
    return LeadSourceRow(
      sourceId: json['sourceId'] as String?,
      name: json['name'] as String?,
      count: json['count'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
    );
  }
}

class LeadOwnerRow {
  const LeadOwnerRow({
    this.membershipId,
    this.name,
    required this.total,
    this.open = 0,
    this.won = 0,
    this.lost = 0,
    this.valueMinor = 0,
  });

  final String? membershipId;
  final String? name;
  final int total;
  final int open;
  final int won;
  final int lost;
  final int valueMinor;

  factory LeadOwnerRow.fromJson(Map<String, dynamic> json) {
    return LeadOwnerRow(
      membershipId: json['membershipId'] as String?,
      name: json['name'] as String?,
      total: json['total'] as int? ?? 0,
      open: json['open'] as int? ?? 0,
      won: json['won'] as int? ?? 0,
      lost: json['lost'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
    );
  }
}

class LeadStageRow {
  const LeadStageRow({required this.stageName, required this.count, this.valueMinor = 0});

  final String stageName;
  final int count;
  final int valueMinor;

  factory LeadStageRow.fromJson(Map<String, dynamic> json) {
    return LeadStageRow(
      stageName: json['stageName'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
    );
  }
}

class LeadCityRow {
  const LeadCityRow({required this.city, required this.count});

  final String city;
  final int count;

  factory LeadCityRow.fromJson(Map<String, dynamic> json) {
    return LeadCityRow(
      city: json['city'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}
