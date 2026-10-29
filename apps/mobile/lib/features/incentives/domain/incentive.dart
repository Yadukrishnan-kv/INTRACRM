/// Models behind Reports → Incentive & Achievement.
///
/// Amounts are minor currency, matching the rest of the money in the app.
library;

import '../../dashboard/domain/dashboard.dart' show formatRupeesShort;

String formatIncentiveMoney(num minor) => formatRupeesShort(minor);

String formatIncentiveBps(int? bps) => bps == null ? '—' : '${(bps / 100).round()}%';

class IncentiveOption {
  const IncentiveOption({required this.code, required this.title, this.description});

  final String code;
  final String title;
  final String? description;

  factory IncentiveOption.fromJson(Map<String, dynamic> json) {
    return IncentiveOption(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
    );
  }
}

class IncentiveSlab {
  const IncentiveSlab({
    required this.id,
    required this.fromBps,
    required this.payoutKind,
    this.label,
    this.toBps,
    this.rateBps,
    this.amount,
    this.perUnitAmount,
    this.bonusAmount = 0,
  });

  final String id;
  final String? label;
  final int fromBps;
  final int? toBps;
  final String payoutKind;
  final int? rateBps;
  final double? amount;
  final double? perUnitAmount;
  final double bonusAmount;

  /// `80% – 100%`, or `120%+` for an open top band.
  String get bandLabel {
    final from = '${(fromBps / 100).round()}%';
    if (toBps == null) {
      return '$from+';
    }
    return '$from – ${(toBps! / 100).round()}%';
  }

  /// `3% of revenue`, `₹5K flat`, `₹12.5 per unit` — plus any band bonus.
  String get payoutLabel {
    final base = switch (payoutKind) {
      'percent' => '${((rateBps ?? 0) / 100).toStringAsFixed(2)}%',
      'flat' => formatIncentiveMoney(amount ?? 0),
      'per_unit' => '${formatIncentiveMoney(perUnitAmount ?? 0)} / unit',
      _ => '—',
    };
    if (bonusAmount > 0) {
      return '$base + ${formatIncentiveMoney(bonusAmount)}';
    }
    return base;
  }

  factory IncentiveSlab.fromJson(Map<String, dynamic> json) {
    return IncentiveSlab(
      id: json['id'] as String? ?? '',
      label: json['label'] as String?,
      fromBps: json['fromBps'] as int? ?? 0,
      toBps: json['toBps'] as int?,
      payoutKind: json['payoutKind'] as String? ?? 'percent',
      rateBps: json['rateBps'] as int?,
      amount: (json['amount'] as num?)?.toDouble(),
      perUnitAmount: (json['perUnitAmount'] as num?)?.toDouble(),
      bonusAmount: (json['bonusAmount'] as num?)?.toDouble() ?? 0,
    );
  }
}

class IncentivePlan {
  const IncentivePlan({
    required this.id,
    required this.name,
    required this.metricCode,
    required this.metricName,
    required this.periodType,
    required this.basis,
    required this.status,
    required this.effectiveFrom,
    required this.version,
    this.description,
    this.scopeType = 'membership',
    this.holdBps = 0,
    this.minAttainmentBps = 0,
    this.payoutCap,
    this.effectiveTo,
    this.slabs = const [],
    this.coverageIssues = const [],
  });

  final String id;
  final String name;
  final String? description;
  final String metricCode;
  final String metricName;
  final String periodType;
  final String scopeType;
  final String basis;
  final String status;
  final int holdBps;
  final int minAttainmentBps;
  final double? payoutCap;
  final String effectiveFrom;
  final String? effectiveTo;
  final List<IncentiveSlab> slabs;

  /// Gaps in the slab ladder the author should fix before activating.
  final List<String> coverageIssues;
  final int version;

  bool get isActive => status == 'active';
  bool get hasIssues => coverageIssues.isNotEmpty;

  factory IncentivePlan.fromJson(Map<String, dynamic> json) {
    return IncentivePlan(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      metricCode: json['metricCode'] as String? ?? '',
      metricName: json['metricName'] as String? ?? '',
      periodType: json['periodType'] as String? ?? 'monthly',
      scopeType: json['scopeType'] as String? ?? 'membership',
      basis: json['basis'] as String? ?? 'revenue',
      status: json['status'] as String? ?? 'draft',
      holdBps: json['holdBps'] as int? ?? 0,
      minAttainmentBps: json['minAttainmentBps'] as int? ?? 0,
      payoutCap: (json['payoutCap'] as num?)?.toDouble(),
      effectiveFrom: json['effectiveFrom'] as String? ?? '',
      effectiveTo: json['effectiveTo'] as String?,
      slabs: [
        for (final slab in json['slabs'] as List<dynamic>? ?? const [])
          if (slab is Map<String, dynamic>) IncentiveSlab.fromJson(slab),
      ],
      coverageIssues: [
        for (final issue in json['coverageIssues'] as List<dynamic>? ?? const [])
          if (issue is String) issue,
      ],
      version: json['version'] as int? ?? 1,
    );
  }
}

class IncentivePayout {
  const IncentivePayout({
    required this.id,
    required this.planId,
    required this.planName,
    required this.periodStart,
    required this.periodEnd,
    required this.targetValue,
    required this.achievedValue,
    required this.earnedAmount,
    required this.status,
    required this.version,
    this.membershipId,
    this.membershipName,
    this.attainmentBps,
    this.slabLabel,
    this.holdAmount = 0,
    this.payableAmount = 0,
    this.paidAmount = 0,
    this.notes,
  });

  final String id;
  final String planId;
  final String planName;
  final String? membershipId;
  final String? membershipName;
  final String periodStart;
  final String periodEnd;
  final double targetValue;
  final double achievedValue;
  final int? attainmentBps;
  final String? slabLabel;
  final double earnedAmount;
  final double holdAmount;
  final double payableAmount;
  final double paidAmount;
  final String status;
  final String? notes;
  final int version;

  bool get isDraft => status == 'draft';
  bool get isApproved => status == 'approved';
  bool get isPaid => status == 'paid';

  factory IncentivePayout.fromJson(Map<String, dynamic> json) {
    return IncentivePayout(
      id: json['id'] as String? ?? '',
      planId: json['planId'] as String? ?? '',
      planName: json['planName'] as String? ?? '',
      membershipId: json['membershipId'] as String?,
      membershipName: json['membershipName'] as String?,
      periodStart: json['periodStart'] as String? ?? '',
      periodEnd: json['periodEnd'] as String? ?? '',
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      attainmentBps: json['attainmentBps'] as int?,
      slabLabel: json['slabLabel'] as String?,
      earnedAmount: (json['earnedAmount'] as num?)?.toDouble() ?? 0,
      holdAmount: (json['holdAmount'] as num?)?.toDouble() ?? 0,
      payableAmount: (json['payableAmount'] as num?)?.toDouble() ?? 0,
      paidAmount: (json['paidAmount'] as num?)?.toDouble() ?? 0,
      status: json['status'] as String? ?? 'draft',
      notes: json['notes'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }
}

class IncentiveTotals {
  const IncentiveTotals({
    this.count = 0,
    this.targetValue = 0,
    this.achievedValue = 0,
    this.earnedAmount = 0,
    this.holdAmount = 0,
    this.payableAmount = 0,
    this.paidAmount = 0,
    this.wonOrders = 0,
    this.completionBps,
    this.averageAttainmentBps,
  });

  final int count;
  final double targetValue;
  final double achievedValue;
  final double earnedAmount;
  final double holdAmount;
  final double payableAmount;
  final double paidAmount;
  final int wonOrders;
  final int? completionBps;
  final int? averageAttainmentBps;

  /// `₹18L / ₹35L` — the Target Achievement card.
  String get achievementLabel =>
      '${formatIncentiveMoney(achievedValue)} / ${formatIncentiveMoney(targetValue)}';

  factory IncentiveTotals.fromJson(Map<String, dynamic> json) {
    return IncentiveTotals(
      count: json['count'] as int? ?? 0,
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      earnedAmount: (json['earnedAmount'] as num?)?.toDouble() ?? 0,
      holdAmount: (json['holdAmount'] as num?)?.toDouble() ?? 0,
      payableAmount: (json['payableAmount'] as num?)?.toDouble() ?? 0,
      paidAmount: (json['paidAmount'] as num?)?.toDouble() ?? 0,
      wonOrders: json['wonOrders'] as int? ?? 0,
      completionBps: json['completionBps'] as int?,
      averageAttainmentBps: json['averageAttainmentBps'] as int?,
    );
  }
}

class IncentiveMemberRow {
  const IncentiveMemberRow({
    required this.membershipName,
    required this.targetValue,
    required this.achievedValue,
    required this.earnedAmount,
    this.membershipId,
    this.payableAmount = 0,
    this.paidAmount = 0,
    this.wonOrders = 0,
    this.periods = 0,
  });

  final String? membershipId;
  final String membershipName;
  final double targetValue;
  final double achievedValue;
  final double earnedAmount;
  final double payableAmount;
  final double paidAmount;
  final int wonOrders;
  final int periods;

  int? get attainmentBps =>
      targetValue <= 0 ? null : ((achievedValue / targetValue) * 10000).round();

  factory IncentiveMemberRow.fromJson(Map<String, dynamic> json) {
    return IncentiveMemberRow(
      membershipId: json['membershipId'] as String?,
      membershipName: json['membershipName'] as String? ?? 'Unassigned',
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      earnedAmount: (json['earnedAmount'] as num?)?.toDouble() ?? 0,
      payableAmount: (json['payableAmount'] as num?)?.toDouble() ?? 0,
      paidAmount: (json['paidAmount'] as num?)?.toDouble() ?? 0,
      wonOrders: json['wonOrders'] as int? ?? 0,
      periods: json['periods'] as int? ?? 0,
    );
  }
}

class IncentiveStatusCount {
  const IncentiveStatusCount({
    required this.status,
    required this.count,
    required this.earnedAmount,
  });

  final String status;
  final int count;
  final double earnedAmount;

  factory IncentiveStatusCount.fromJson(Map<String, dynamic> json) {
    return IncentiveStatusCount(
      status: json['status'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      earnedAmount: (json['earnedAmount'] as num?)?.toDouble() ?? 0,
    );
  }
}

class IncentiveReport {
  const IncentiveReport({
    required this.generatedAt,
    required this.totals,
    this.byStatus = const [],
    this.byMember = const [],
    this.items = const [],
  });

  final DateTime generatedAt;
  final IncentiveTotals totals;
  final List<IncentiveStatusCount> byStatus;
  final List<IncentiveMemberRow> byMember;
  final List<IncentivePayout> items;

  bool get isEmpty => items.isEmpty;

  factory IncentiveReport.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [
        for (final item in items)
          if (item is Map<String, dynamic>) parse(item),
      ];
    }

    return IncentiveReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: IncentiveTotals.fromJson(json['totals'] as Map<String, dynamic>? ?? const {}),
      byStatus: list('byStatus', IncentiveStatusCount.fromJson),
      byMember: list('byMember', IncentiveMemberRow.fromJson),
      items: list('items', IncentivePayout.fromJson),
    );
  }
}

class MyIncentive {
  const MyIncentive({
    required this.totals,
    this.items = const [],
  });

  final IncentiveTotals totals;
  final List<IncentivePayout> items;

  factory MyIncentive.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return MyIncentive(
      totals: IncentiveTotals.fromJson(summary['totals'] as Map<String, dynamic>? ?? const {}),
      items: [
        for (final item in json['items'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) IncentivePayout.fromJson(item),
      ],
    );
  }
}
