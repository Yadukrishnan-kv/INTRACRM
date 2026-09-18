import '../../dashboard/domain/dashboard.dart';

class AnalyticsFunnelStep {
  const AnalyticsFunnelStep({
    required this.code,
    required this.label,
    required this.value,
    this.conversionFromPreviousBps,
    this.dropOffCount,
  });

  final String code;
  final String label;
  final int value;
  final int? conversionFromPreviousBps;
  final int? dropOffCount;

  String get conversionLabel {
    final bps = conversionFromPreviousBps;
    if (bps == null) {
      return '—';
    }
    return '${(bps / 100).toStringAsFixed(0)}%';
  }

  factory AnalyticsFunnelStep.fromJson(Map<String, dynamic> json) {
    return AnalyticsFunnelStep(
      code: json['code'] as String? ?? '',
      label: json['label'] as String? ?? '',
      value: json['value'] as int? ?? 0,
      conversionFromPreviousBps: json['conversionFromPreviousBps'] as int?,
      dropOffCount: json['dropOffCount'] as int?,
    );
  }
}

class AnalyticsConversion {
  const AnalyticsConversion({
    this.leadToQualifiedBps,
    this.qualifiedToQuotationBps,
    this.quotationToWonBps,
    this.overallBps,
  });

  final int? leadToQualifiedBps;
  final int? qualifiedToQuotationBps;
  final int? quotationToWonBps;
  final int? overallBps;

  factory AnalyticsConversion.fromJson(Map<String, dynamic> json) {
    return AnalyticsConversion(
      leadToQualifiedBps: json['leadToQualifiedBps'] as int?,
      qualifiedToQuotationBps: json['qualifiedToQuotationBps'] as int?,
      quotationToWonBps: json['quotationToWonBps'] as int?,
      overallBps: json['overallBps'] as int?,
    );
  }
}

class AnalyticsFunnel {
  const AnalyticsFunnel({
    this.steps = const [],
    this.conversion = const AnalyticsConversion(),
  });

  final List<AnalyticsFunnelStep> steps;
  final AnalyticsConversion conversion;

  factory AnalyticsFunnel.fromJson(Map<String, dynamic> json) {
    return AnalyticsFunnel(
      steps: [
        for (final item in json['steps'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) AnalyticsFunnelStep.fromJson(item),
      ],
      conversion: AnalyticsConversion.fromJson(
        json['conversion'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AnalyticsDashboard {
  const AnalyticsDashboard({
    required this.generatedAt,
    required this.timezone,
    required this.today,
    required this.month,
    this.todayFunnel = const AnalyticsFunnel(),
    this.monthFunnel = const AnalyticsFunnel(),
    this.widgets = const {},
  });

  final DateTime generatedAt;
  final String timezone;
  final String today;
  final DashboardPeriod month;
  final AnalyticsFunnel todayFunnel;
  final AnalyticsFunnel monthFunnel;
  final Map<String, DashboardWidget> widgets;

  List<DashboardWidget> get ordered {
    return [
      for (final code in AnalyticsMetrics.all)
        if (widgets[code] != null) widgets[code]!,
    ];
  }

  DashboardWidget? widget(String code) => widgets[code];

  factory AnalyticsDashboard.fromJson(Map<String, dynamic> json) {
    final raw = json['widgets'] as Map<String, dynamic>? ?? const {};
    final funnel = json['funnel'] as Map<String, dynamic>? ?? const {};
    return AnalyticsDashboard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      month: DashboardPeriod.fromJson(json['month'] as Map<String, dynamic>? ?? const {}),
      todayFunnel: AnalyticsFunnel.fromJson(funnel['today'] as Map<String, dynamic>? ?? funnel),
      monthFunnel: AnalyticsFunnel.fromJson(funnel['month'] as Map<String, dynamic>? ?? funnel),
      widgets: {
        for (final entry in raw.entries)
          if (entry.value is Map<String, dynamic>)
            entry.key: DashboardWidget.fromJson(entry.value as Map<String, dynamic>),
      },
    );
  }
}

class AnalyticsMetrics {
  static const leads = 'leads';
  static const qualified = 'qualified';
  static const quotations = 'quotations';
  static const won = 'won';
  static const conversion = 'conversion';

  static const all = [leads, qualified, quotations, won, conversion];

  static String title(String code) {
    return switch (code) {
      leads => 'Leads',
      qualified => 'Qualified',
      quotations => 'Quotations',
      won => 'Won',
      conversion => 'Conversion',
      _ => code,
    };
  }
}

String analyticsPercent(int? bps) {
  if (bps == null) {
    return '—';
  }
  return '${(bps / 100).toStringAsFixed(0)}%';
}
