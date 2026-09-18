class SalesReport {
  const SalesReport({
    required this.generatedAt,
    required this.totals,
    this.byAssignee = const [],
    this.byMonth = const [],
  });

  final DateTime generatedAt;
  final SalesReportTotals totals;
  final List<SalesAssigneeRow> byAssignee;
  final List<SalesMonthRow> byMonth;

  factory SalesReport.fromJson(Map<String, dynamic> json) {
    return SalesReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: SalesReportTotals.fromJson(
        json['totals'] as Map<String, dynamic>? ?? const {},
      ),
      byAssignee: [
        for (final item in json['byAssignee'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) SalesAssigneeRow.fromJson(item),
      ],
      byMonth: [
        for (final item in json['byMonth'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) SalesMonthRow.fromJson(item),
      ],
    );
  }
}

class SalesReportTotals {
  const SalesReportTotals({
    required this.deals,
    required this.revenueMinor,
    this.averageDealMinor,
    this.lostDeals = 0,
    this.lostValueMinor = 0,
    this.closedDeals = 0,
    this.winRateBps,
  });

  final int deals;
  final int revenueMinor;
  final int? averageDealMinor;
  final int lostDeals;
  final int lostValueMinor;
  final int closedDeals;
  final int? winRateBps;

  factory SalesReportTotals.fromJson(Map<String, dynamic> json) {
    return SalesReportTotals(
      deals: json['deals'] as int? ?? 0,
      revenueMinor: json['revenueMinor'] as int? ?? 0,
      averageDealMinor: json['averageDealMinor'] as int?,
      lostDeals: json['lostDeals'] as int? ?? 0,
      lostValueMinor: json['lostValueMinor'] as int? ?? 0,
      closedDeals: json['closedDeals'] as int? ?? 0,
      winRateBps: json['winRateBps'] as int?,
    );
  }
}

class SalesAssigneeRow {
  const SalesAssigneeRow({
    this.membershipId,
    this.name,
    required this.deals,
    required this.revenueMinor,
    this.lostDeals = 0,
  });

  final String? membershipId;
  final String? name;
  final int deals;
  final int revenueMinor;
  final int lostDeals;

  factory SalesAssigneeRow.fromJson(Map<String, dynamic> json) {
    return SalesAssigneeRow(
      membershipId: json['membershipId'] as String?,
      name: json['name'] as String?,
      deals: json['deals'] as int? ?? 0,
      revenueMinor: json['revenueMinor'] as int? ?? 0,
      lostDeals: json['lostDeals'] as int? ?? 0,
    );
  }
}

class SalesMonthRow {
  const SalesMonthRow({
    required this.month,
    required this.deals,
    required this.revenueMinor,
  });

  final String month;
  final int deals;
  final int revenueMinor;

  factory SalesMonthRow.fromJson(Map<String, dynamic> json) {
    return SalesMonthRow(
      month: json['month'] as String? ?? '',
      deals: json['deals'] as int? ?? 0,
      revenueMinor: json['revenueMinor'] as int? ?? 0,
    );
  }
}
