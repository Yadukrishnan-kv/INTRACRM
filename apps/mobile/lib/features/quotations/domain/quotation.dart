class QuotationItem {
  const QuotationItem({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
    required this.discountMinor,
    required this.taxBps,
    required this.lineTotalMinor,
    this.productId,
    this.productName,
    this.sortOrder = 0,
    this.taxRateIds = const [],
  });

  final String id;
  final String? productId;
  final String? productName;
  final String description;
  final int quantity;
  final int unitPriceMinor;
  final int discountMinor;
  final int taxBps;
  final List<String> taxRateIds;
  final int lineTotalMinor;
  final int sortOrder;

  factory QuotationItem.fromJson(Map<String, dynamic> json) {
    return QuotationItem(
      id: json['id'] as String? ?? '',
      productId: json['productId'] as String?,
      productName: json['productName'] as String?,
      description: json['description'] as String? ?? '',
      quantity: asWholeQty(json['quantity']),
      unitPriceMinor: json['unitPriceMinor'] as int? ?? 0,
      discountMinor: json['discountMinor'] as int? ?? 0,
      taxBps: json['taxBps'] as int? ?? 0,
      taxRateIds: [
        for (final item in json['taxRateIds'] as List<dynamic>? ?? const [])
          if (item is String) item,
      ],
      lineTotalMinor: json['lineTotalMinor'] as int? ?? 0,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}

class ClosingPrediction {
  const ClosingPrediction({
    required this.probabilityBps,
    required this.band,
    this.expectedCloseOn,
    this.reasons = const [],
  });

  final int probabilityBps;
  final String band;
  final String? expectedCloseOn;
  final List<String> reasons;

  double get fraction => (probabilityBps.clamp(0, 10000)) / 10000;
  String get percentLabel => '${(probabilityBps / 100).toStringAsFixed(0)}%';

  static String bandTitle(String band) {
    return switch (band) {
      'high' => 'High',
      'medium' => 'Medium',
      'low' => 'Low',
      'won' => 'Won',
      'lost' => 'Lost',
      _ => band,
    };
  }

  factory ClosingPrediction.fromJson(Map<String, dynamic> json) {
    final reasons = json['reasons'] as List<dynamic>? ?? const [];
    return ClosingPrediction(
      probabilityBps: json['probabilityBps'] as int? ?? 0,
      band: json['band'] as String? ?? 'low',
      expectedCloseOn: json['expectedCloseOn'] as String?,
      reasons: [for (final item in reasons) if (item is String) item],
    );
  }
}

class Quotation {
  const Quotation({
    required this.id,
    required this.quotationNumber,
    required this.status,
    required this.currency,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.taxMinor,
    required this.totalMinor,
    required this.leadId,
    required this.version,
    this.title,
    this.validUntilOn,
    this.notes,
    this.terms,
    this.sentAt,
    this.followUpAt,
    this.customerDecidingAt,
    this.negotiationAt,
    this.approvedAt,
    this.wonAt,
    this.lostAt,
    this.lostReason,
    this.nextFollowUpAt,
    this.remindAt,
    this.expectedCloseOn,
    this.lastFollowedUpAt,
    this.followUpNote,
    this.reminderBucket,
    this.closingSoon = false,
    this.closingOverdue = false,
    this.closingPrediction,
    this.assignedToMembershipId,
    this.assigneeName,
    this.leadNumber,
    this.leadTitle,
    this.customerName,
    this.nextStatuses = const [],
    this.items = const [],
  });

  final String id;
  final String quotationNumber;
  final String? title;
  final String status;
  final String currency;
  final int subtotalMinor;
  final int discountMinor;
  final int taxMinor;
  final int totalMinor;
  final String? validUntilOn;
  final String? notes;
  final String? terms;
  final DateTime? sentAt;
  final DateTime? followUpAt;
  final DateTime? customerDecidingAt;
  final DateTime? negotiationAt;
  final DateTime? approvedAt;
  final DateTime? wonAt;
  final DateTime? lostAt;
  final String? lostReason;
  final DateTime? nextFollowUpAt;
  final DateTime? remindAt;
  final String? expectedCloseOn;
  final DateTime? lastFollowedUpAt;
  final String? followUpNote;
  final String? reminderBucket;
  final bool closingSoon;
  final bool closingOverdue;
  final ClosingPrediction? closingPrediction;
  final String? assignedToMembershipId;
  final String? assigneeName;
  final String leadId;
  final String? leadNumber;
  final String? leadTitle;
  final String? customerName;
  final List<String> nextStatuses;
  final List<QuotationItem> items;
  final int version;

  bool get isDraft => status == QuotationStatuses.draft;
  bool get isOpen => status != QuotationStatuses.won && status != QuotationStatuses.lost;
  bool get isPending =>
      status != QuotationStatuses.draft &&
      status != QuotationStatuses.won &&
      status != QuotationStatuses.lost;
  String get displayTitle => title?.trim().isNotEmpty == true ? title! : quotationNumber;
  String get totalLabel => '₹${(totalMinor / 100).toStringAsFixed(0)}';
  String get predictionLabel {
    final prediction = closingPrediction;
    if (prediction == null) {
      return '—';
    }
    return '${prediction.percentLabel} · ${ClosingPrediction.bandTitle(prediction.band)}';
  }

  factory Quotation.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    final next = json['nextStatuses'] as List<dynamic>? ?? const [];
    return Quotation(
      id: json['id'] as String? ?? '',
      quotationNumber: json['quotationNumber'] as String? ?? '',
      title: json['title'] as String?,
      status: json['status'] as String? ?? QuotationStatuses.draft,
      currency: json['currency'] as String? ?? 'INR',
      subtotalMinor: json['subtotalMinor'] as int? ?? 0,
      discountMinor: json['discountMinor'] as int? ?? 0,
      taxMinor: json['taxMinor'] as int? ?? 0,
      totalMinor: json['totalMinor'] as int? ?? 0,
      validUntilOn: json['validUntilOn'] as String?,
      notes: json['notes'] as String?,
      terms: json['terms'] as String?,
      sentAt: DateTime.tryParse(json['sentAt'] as String? ?? ''),
      followUpAt: DateTime.tryParse(json['followUpAt'] as String? ?? ''),
      customerDecidingAt: DateTime.tryParse(json['customerDecidingAt'] as String? ?? ''),
      negotiationAt: DateTime.tryParse(json['negotiationAt'] as String? ?? ''),
      approvedAt: DateTime.tryParse(json['approvedAt'] as String? ?? ''),
      wonAt: DateTime.tryParse(json['wonAt'] as String? ?? ''),
      lostAt: DateTime.tryParse(json['lostAt'] as String? ?? ''),
      lostReason: json['lostReason'] as String?,
      nextFollowUpAt: DateTime.tryParse(json['nextFollowUpAt'] as String? ?? ''),
      remindAt: DateTime.tryParse(json['remindAt'] as String? ?? ''),
      expectedCloseOn: json['expectedCloseOn'] as String?,
      lastFollowedUpAt: DateTime.tryParse(json['lastFollowedUpAt'] as String? ?? ''),
      followUpNote: json['followUpNote'] as String?,
      reminderBucket: json['reminderBucket'] as String?,
      closingSoon: json['closingSoon'] as bool? ?? false,
      closingOverdue: json['closingOverdue'] as bool? ?? false,
      closingPrediction: json['closingPrediction'] is Map<String, dynamic>
          ? ClosingPrediction.fromJson(json['closingPrediction'] as Map<String, dynamic>)
          : null,
      assignedToMembershipId: json['assignedToMembershipId'] as String?,
      assigneeName: json['assigneeName'] as String?,
      leadId: json['leadId'] as String? ?? '',
      leadNumber: json['leadNumber'] as String?,
      leadTitle: json['leadTitle'] as String?,
      customerName: json['customerName'] as String?,
      nextStatuses: [for (final item in next) if (item is String) item],
      items: [
        for (final item in items)
          if (item is Map<String, dynamic>) QuotationItem.fromJson(item),
      ],
      version: json['version'] as int? ?? 1,
    );
  }
}

class QuotationReport {
  const QuotationReport({
    required this.generatedAt,
    required this.totals,
    this.byStatus = const [],
    this.byAssignee = const [],
  });

  final DateTime generatedAt;
  final QuotationReportTotals totals;
  final List<QuotationStatusRow> byStatus;
  final List<QuotationAssigneeRow> byAssignee;

  factory QuotationReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    final byStatus = json['byStatus'] as List<dynamic>? ?? const [];
    final byAssignee = json['byAssignee'] as List<dynamic>? ?? const [];
    return QuotationReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: QuotationReportTotals.fromJson(totals),
      byStatus: [
        for (final item in byStatus)
          if (item is Map<String, dynamic>) QuotationStatusRow.fromJson(item),
      ],
      byAssignee: [
        for (final item in byAssignee)
          if (item is Map<String, dynamic>) QuotationAssigneeRow.fromJson(item),
      ],
    );
  }
}

class QuotationReportTotals {
  const QuotationReportTotals({
    required this.total,
    required this.draft,
    required this.sent,
    required this.followUp,
    required this.customerDeciding,
    required this.negotiation,
    required this.approved,
    required this.won,
    required this.lost,
    required this.openValueMinor,
    required this.wonValueMinor,
    required this.lostValueMinor,
    this.winRateBps,
    this.pending = 0,
    this.pendingValueMinor = 0,
    this.overdueReminders = 0,
    this.closingSoon = 0,
    this.closingOverdue = 0,
    this.noFollowUp = 0,
    this.averagePredictionBps,
  });

  final int total;
  final int draft;
  final int sent;
  final int followUp;
  final int customerDeciding;
  final int negotiation;
  final int approved;
  final int won;
  final int lost;
  final int openValueMinor;
  final int wonValueMinor;
  final int lostValueMinor;
  final int? winRateBps;
  final int pending;
  final int pendingValueMinor;
  final int overdueReminders;
  final int closingSoon;
  final int closingOverdue;
  final int noFollowUp;
  final int? averagePredictionBps;

  String get winRateLabel =>
      winRateBps == null ? '—' : '${(winRateBps! / 100).toStringAsFixed(1)}%';
  String get averagePredictionLabel => averagePredictionBps == null
      ? '—'
      : '${(averagePredictionBps! / 100).toStringAsFixed(0)}%';

  factory QuotationReportTotals.fromJson(Map<String, dynamic> json) {
    return QuotationReportTotals(
      total: json['total'] as int? ?? 0,
      draft: json['draft'] as int? ?? 0,
      sent: json['sent'] as int? ?? 0,
      followUp: json['followUp'] as int? ?? 0,
      customerDeciding: json['customerDeciding'] as int? ?? 0,
      negotiation: json['negotiation'] as int? ?? 0,
      approved: json['approved'] as int? ?? 0,
      won: json['won'] as int? ?? 0,
      lost: json['lost'] as int? ?? 0,
      openValueMinor: json['openValueMinor'] as int? ?? 0,
      wonValueMinor: json['wonValueMinor'] as int? ?? 0,
      lostValueMinor: json['lostValueMinor'] as int? ?? 0,
      winRateBps: json['winRateBps'] as int?,
      pending: json['pending'] as int? ?? 0,
      pendingValueMinor: json['pendingValueMinor'] as int? ?? 0,
      overdueReminders: json['overdueReminders'] as int? ?? 0,
      closingSoon: json['closingSoon'] as int? ?? 0,
      closingOverdue: json['closingOverdue'] as int? ?? 0,
      noFollowUp: json['noFollowUp'] as int? ?? 0,
      averagePredictionBps: json['averagePredictionBps'] as int?,
    );
  }
}

class QuotationStatusRow {
  const QuotationStatusRow({
    required this.status,
    required this.count,
    required this.valueMinor,
  });

  final String status;
  final int count;
  final int valueMinor;

  factory QuotationStatusRow.fromJson(Map<String, dynamic> json) {
    return QuotationStatusRow(
      status: json['status'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
    );
  }
}

class QuotationAssigneeRow {
  const QuotationAssigneeRow({
    required this.total,
    required this.won,
    required this.lost,
    required this.wonValueMinor,
    this.membershipId,
    this.name,
  });

  final String? membershipId;
  final String? name;
  final int total;
  final int won;
  final int lost;
  final int wonValueMinor;

  factory QuotationAssigneeRow.fromJson(Map<String, dynamic> json) {
    return QuotationAssigneeRow(
      membershipId: json['membershipId'] as String?,
      name: json['name'] as String?,
      total: json['total'] as int? ?? 0,
      won: json['won'] as int? ?? 0,
      lost: json['lost'] as int? ?? 0,
      wonValueMinor: json['wonValueMinor'] as int? ?? 0,
    );
  }
}

class QuotationProduct {
  const QuotationProduct({
    required this.id,
    required this.name,
    this.sku,
    this.unitPriceMinor,
    this.currency = 'INR',
  });

  final String id;
  final String name;
  final String? sku;
  final int? unitPriceMinor;
  final String currency;

  String get label => sku == null || sku!.isEmpty ? name : '$sku · $name';

  factory QuotationProduct.fromJson(Map<String, dynamic> json) {
    return QuotationProduct(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      sku: json['sku'] as String?,
      unitPriceMinor: json['unitPriceMinor'] as int?,
      currency: json['currency'] as String? ?? 'INR',
    );
  }
}

class QuotationTax {
  const QuotationTax({
    required this.id,
    required this.name,
    this.code = '',
    this.rateBps = 0,
    this.ratePercent = 0,
  });

  final String id;
  final String name;
  final String code;
  final int rateBps;
  final double ratePercent;

  String get label => name.isNotEmpty ? name : '$ratePercent%';

  factory QuotationTax.fromJson(Map<String, dynamic> json) {
    final bps = json['rateBps'] as int? ?? 0;
    return QuotationTax(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      rateBps: bps,
      ratePercent: (json['ratePercent'] as num?)?.toDouble() ?? bps / 100,
    );
  }
}

class QuotationCatalog {
  const QuotationCatalog({this.products = const [], this.taxes = const []});

  final List<QuotationProduct> products;
  final List<QuotationTax> taxes;

  factory QuotationCatalog.fromJson(Map<String, dynamic> json) {
    final products = json['products'] as List<dynamic>? ?? const [];
    final taxes = json['taxes'] as List<dynamic>? ?? const [];
    return QuotationCatalog(
      products: [
        for (final item in products)
          if (item is Map<String, dynamic>) QuotationProduct.fromJson(item),
      ],
      taxes: [
        for (final item in taxes)
          if (item is Map<String, dynamic>) QuotationTax.fromJson(item),
      ],
    );
  }
}

int asWholeQty(Object? value) {
  if (value is int) {
    return value < 1 ? 1 : value;
  }
  if (value is num) {
    final rounded = value.round();
    return rounded < 1 ? 1 : rounded;
  }
  return int.tryParse('$value') ?? 1;
}

int rupeesToMinor(String value) {
  final parsed = double.tryParse(value.trim());
  if (parsed == null) {
    return 0;
  }
  return (parsed * 100).round();
}

String minorToRupeesLabel(int minor) => '₹${(minor / 100).toStringAsFixed(0)}';

class QuotationFollowUpBuckets {
  static const pending = 'pending';
  static const overdue = 'overdue';
  static const today = 'today';
  static const upcoming = 'upcoming';
  static const closingSoon = 'closing_soon';
  static const closingOverdue = 'closing_overdue';
  static const noFollowUp = 'no_follow_up';
  static const all = [
    pending,
    overdue,
    today,
    upcoming,
    closingSoon,
    closingOverdue,
    noFollowUp,
  ];

  static String title(String code) {
    return switch (code) {
      pending => 'Pending',
      overdue => 'Overdue',
      today => 'Today',
      upcoming => 'Upcoming',
      closingSoon => 'Closing soon',
      closingOverdue => 'Close overdue',
      noFollowUp => 'No reminder',
      _ => code,
    };
  }
}

class QuotationFollowUpDashboard {
  const QuotationFollowUpDashboard({
    required this.generatedAt,
    required this.timezone,
    required this.widgets,
    this.pendingValueMinor = 0,
  });

  final DateTime generatedAt;
  final String timezone;
  final List<QuotationFollowUpWidget> widgets;
  final int pendingValueMinor;

  factory QuotationFollowUpDashboard.fromJson(Map<String, dynamic> json) {
    final widgets = json['widgets'] as List<dynamic>? ?? const [];
    return QuotationFollowUpDashboard(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      pendingValueMinor: json['pendingValueMinor'] as int? ?? 0,
      widgets: [
        for (final item in widgets)
          if (item is Map<String, dynamic>) QuotationFollowUpWidget.fromJson(item),
      ],
    );
  }

  QuotationFollowUpWidget? widget(String code) {
    for (final item in widgets) {
      if (item.code == code) {
        return item;
      }
    }
    return null;
  }
}

class QuotationFollowUpWidget {
  const QuotationFollowUpWidget({
    required this.code,
    required this.title,
    required this.count,
    this.items = const [],
  });

  final String code;
  final String title;
  final int count;
  final List<Quotation> items;

  factory QuotationFollowUpWidget.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    return QuotationFollowUpWidget(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      items: [
        for (final item in items)
          if (item is Map<String, dynamic>) Quotation.fromJson(item),
      ],
    );
  }
}

class QuotationStatuses {
  static const draft = 'draft';
  static const sent = 'sent';
  static const followUp = 'follow_up';
  static const customerDeciding = 'customer_deciding';
  static const negotiation = 'negotiation';
  static const approved = 'approved';
  static const won = 'won';
  static const lost = 'lost';
  static const all = [
    draft,
    sent,
    followUp,
    customerDeciding,
    negotiation,
    approved,
    won,
    lost,
  ];

  static String title(String code) {
    return switch (code) {
      draft => 'Draft',
      sent => 'Sent',
      followUp => 'Follow-up',
      customerDeciding => 'Customer Deciding',
      negotiation => 'Negotiation',
      approved => 'Approved',
      won => 'Won',
      lost => 'Lost',
      _ => code,
    };
  }
}
