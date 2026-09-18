import '../../targets/domain/target.dart';

class DashboardSeriesPoint {
  const DashboardSeriesPoint({required this.date, required this.label, required this.value});

  final String date;
  final String label;
  final int value;

  factory DashboardSeriesPoint.fromJson(Map<String, dynamic> json) {
    return DashboardSeriesPoint(
      date: json['date'] as String? ?? '',
      label: json['label'] as String? ?? '',
      value: json['value'] as int? ?? 0,
    );
  }
}

class DashboardMixSlice {
  const DashboardMixSlice({required this.code, required this.label, required this.value});

  final String code;
  final String label;
  final int value;

  factory DashboardMixSlice.fromJson(Map<String, dynamic> json) {
    return DashboardMixSlice(
      code: json['code'] as String? ?? '',
      label: json['label'] as String? ?? '',
      value: json['value'] as int? ?? 0,
    );
  }
}

class DashboardMetric {
  const DashboardMetric({required this.code, required this.label, required this.value});

  final String code;
  final String label;
  final int value;

  factory DashboardMetric.fromJson(Map<String, dynamic> json) {
    return DashboardMetric(
      code: json['code'] as String? ?? '',
      label: json['label'] as String? ?? '',
      value: json['value'] as int? ?? 0,
    );
  }
}

class DashboardWidget {
  const DashboardWidget({
    required this.code,
    required this.title,
    required this.primary,
    required this.primaryLabel,
    required this.previous,
    required this.month,
    this.deltaBps,
    this.metrics = const [],
    this.series = const [],
    this.mix = const [],
  });

  final String code;
  final String title;
  final int primary;
  final String primaryLabel;
  final int previous;
  final int? deltaBps;
  final int month;
  final List<DashboardMetric> metrics;
  final List<DashboardSeriesPoint> series;
  final List<DashboardMixSlice> mix;

  bool get isMoney => code == DashboardWidgets.sales;
  bool get isScore => code == DashboardWidgets.staffPerformance || code == 'conversion';

  String get primaryText => formatDashboardValue(primary, money: isMoney, score: isScore);
  String get monthText => formatDashboardValue(month, money: isMoney, score: code == 'conversion');
  String get deltaText => deltaLabel(deltaBps);

  factory DashboardWidget.fromJson(Map<String, dynamic> json) {
    return DashboardWidget(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      primary: json['primary'] as int? ?? 0,
      primaryLabel: json['primaryLabel'] as String? ?? '',
      previous: json['previous'] as int? ?? 0,
      deltaBps: json['deltaBps'] as int?,
      month: json['month'] as int? ?? 0,
      metrics: [
        for (final item in json['metrics'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardMetric.fromJson(item),
      ],
      series: [
        for (final item in json['series'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardSeriesPoint.fromJson(item),
      ],
      mix: [
        for (final item in json['mix'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardMixSlice.fromJson(item),
      ],
    );
  }
}

class DashboardPeriod {
  const DashboardPeriod({required this.start, required this.end, required this.label});

  final String start;
  final String end;
  final String label;

  factory DashboardPeriod.fromJson(Map<String, dynamic> json) {
    return DashboardPeriod(
      start: json['start'] as String? ?? '',
      end: json['end'] as String? ?? '',
      label: json['label'] as String? ?? '',
    );
  }
}

class DashboardOverview {
  const DashboardOverview({
    required this.generatedAt,
    required this.timezone,
    required this.today,
    required this.month,
    this.widgets = const {},
  });

  final DateTime generatedAt;
  final String timezone;
  final String today;
  final DashboardPeriod month;
  final Map<String, DashboardWidget> widgets;

  List<DashboardWidget> get ordered {
    return [
      for (final code in DashboardWidgets.all)
        if (widgets[code] != null) widgets[code]!,
    ];
  }

  DashboardWidget? widget(String code) => widgets[code];

  factory DashboardOverview.fromJson(Map<String, dynamic> json) {
    final raw = json['widgets'] as Map<String, dynamic>? ?? const {};
    return DashboardOverview(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      month: DashboardPeriod.fromJson(json['month'] as Map<String, dynamic>? ?? const {}),
      widgets: {
        for (final entry in raw.entries)
          if (entry.value is Map<String, dynamic>)
            entry.key: DashboardWidget.fromJson(entry.value as Map<String, dynamic>),
      },
    );
  }
}

class DashboardWidgets {
  static const leads = 'leads';
  static const followUps = 'follow_ups';
  static const quotations = 'quotations';
  static const orders = 'orders';
  static const sales = 'sales';
  static const staffPerformance = 'staff_performance';

  static const all = [leads, followUps, quotations, orders, sales, staffPerformance];
  static const staff = [leads, followUps, quotations, orders, sales];

  static String title(String code) {
    return switch (code) {
      leads => "Today's leads",
      followUps => 'Follow-ups',
      quotations => 'Quotations',
      orders => 'Orders',
      sales => 'Sales',
      staffPerformance => 'Staff performance',
      _ => code,
    };
  }
}

String formatDashboardValue(int value, {required bool money, required bool score}) {
  if (money) {
    return '₹${(value / 100).toStringAsFixed(0)}';
  }
  if (score) {
    return '${(value / 100).toStringAsFixed(0)}%';
  }
  return '$value';
}

String deltaLabel(int? bps) {
  if (bps == null) {
    return '—';
  }
  final percent = (bps / 100).abs().toStringAsFixed(0);
  if (bps > 0) {
    return '+$percent%';
  }
  if (bps < 0) {
    return '-$percent%';
  }
  return '0%';
}

String metricDisplay(DashboardWidget widget, DashboardMetric metric) {
  if (metric.code.startsWith('revenue_') || (widget.isMoney && metric.code != 'achievement_bps')) {
    return formatDashboardValue(metric.value, money: true, score: false);
  }
  if (metric.code.endsWith('_bps') || metric.code == 'rate_bps' || widget.isScore) {
    return formatDashboardValue(metric.value, money: false, score: true);
  }
  return '${metric.value}';
}

class PersonalKpi {
  const PersonalKpi({
    required this.code,
    required this.title,
    required this.detail,
    this.valueBps,
  });

  final String code;
  final String title;
  final String detail;
  final int? valueBps;

  String get valueLabel => formatDashboardValue(valueBps ?? 0, money: false, score: true);
  double get fraction => ((valueBps ?? 0).clamp(0, 10000)) / 10000;

  factory PersonalKpi.fromJson(Map<String, dynamic> json) {
    return PersonalKpi(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      detail: json['detail'] as String? ?? '',
      valueBps: json['valueBps'] as int?,
    );
  }
}

class StaffDashboardMembership {
  const StaffDashboardMembership({
    required this.id,
    required this.name,
    required this.rank,
    required this.rankedOutOf,
    this.designation,
    this.teamName,
    this.teamRank,
    this.scoreBps,
    this.scoreBand = 'no_data',
  });

  final String id;
  final String name;
  final String? designation;
  final String? teamName;
  final int rank;
  final int? teamRank;
  final int rankedOutOf;
  final int? scoreBps;
  final String scoreBand;

  String get scoreLabel => formatDashboardValue(scoreBps ?? 0, money: false, score: true);
  String get rankLabel => '#$rank of $rankedOutOf';

  factory StaffDashboardMembership.fromJson(Map<String, dynamic> json) {
    return StaffDashboardMembership(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      designation: json['designation'] as String?,
      teamName: json['teamName'] as String?,
      rank: json['rank'] as int? ?? 0,
      teamRank: json['teamRank'] as int?,
      rankedOutOf: json['rankedOutOf'] as int? ?? 0,
      scoreBps: json['scoreBps'] as int?,
      scoreBand: json['scoreBand'] as String? ?? 'no_data',
    );
  }
}

class StaffDashboard {
  const StaffDashboard({
    required this.generatedAt,
    required this.timezone,
    required this.today,
    required this.month,
    required this.membership,
    this.kpis = const [],
    this.targets = const [],
    this.widgets = const {},
  });

  final DateTime generatedAt;
  final String timezone;
  final String today;
  final DashboardPeriod month;
  final StaffDashboardMembership membership;
  final List<PersonalKpi> kpis;
  final List<Target> targets;
  final Map<String, DashboardWidget> widgets;

  List<DashboardWidget> get orderedWidgets {
    return [
      for (final code in DashboardWidgets.staff)
        if (widgets[code] != null) widgets[code]!,
    ];
  }

  factory StaffDashboard.fromJson(Map<String, dynamic> json) {
    final raw = json['widgets'] as Map<String, dynamic>? ?? const {};
    final kpis = json['kpis'] as List<dynamic>? ?? const [];
    final targets = json['targets'] as List<dynamic>? ?? const [];
    return StaffDashboard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      month: DashboardPeriod.fromJson(json['month'] as Map<String, dynamic>? ?? const {}),
      membership: StaffDashboardMembership.fromJson(
        json['membership'] as Map<String, dynamic>? ?? const {},
      ),
      kpis: [
        for (final item in kpis)
          if (item is Map<String, dynamic>) PersonalKpi.fromJson(item),
      ],
      targets: [
        for (final item in targets)
          if (item is Map<String, dynamic>) Target.fromJson(item),
      ],
      widgets: {
        for (final entry in raw.entries)
          if (entry.value is Map<String, dynamic>)
            entry.key: DashboardWidget.fromJson(entry.value as Map<String, dynamic>),
      },
    );
  }
}
