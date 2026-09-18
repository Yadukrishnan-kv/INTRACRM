import '../../dashboard/domain/dashboard.dart';

class FunnelReportStage {
  const FunnelReportStage({
    required this.code,
    required this.label,
    required this.currentCount,
    required this.reachedCount,
    required this.currentValueMinor,
    required this.reachedValueMinor,
    this.conversionFromPreviousBps,
    this.dropOffCount,
    this.series = const [],
  });

  final String code;
  final String label;
  final int currentCount;
  final int reachedCount;
  final int currentValueMinor;
  final int reachedValueMinor;
  final int? conversionFromPreviousBps;
  final int? dropOffCount;
  final List<DashboardSeriesPoint> series;

  String get conversionLabel {
    final bps = conversionFromPreviousBps;
    if (bps == null) {
      return '—';
    }
    return '${(bps / 100).toStringAsFixed(0)}%';
  }

  factory FunnelReportStage.fromJson(Map<String, dynamic> json) {
    return FunnelReportStage(
      code: json['code'] as String? ?? '',
      label: json['label'] as String? ?? '',
      currentCount: json['currentCount'] as int? ?? 0,
      reachedCount: json['reachedCount'] as int? ?? 0,
      currentValueMinor: json['currentValueMinor'] as int? ?? 0,
      reachedValueMinor: json['reachedValueMinor'] as int? ?? 0,
      conversionFromPreviousBps: json['conversionFromPreviousBps'] as int?,
      dropOffCount: json['dropOffCount'] as int?,
      series: [
        for (final item in json['series'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardSeriesPoint.fromJson(item),
      ],
    );
  }
}

class FunnelReportConversion {
  const FunnelReportConversion({
    this.leadToQualifiedBps,
    this.qualifiedToQuotationBps,
    this.quotationToNegotiationBps,
    this.negotiationToWonBps,
    this.overallBps,
  });

  final int? leadToQualifiedBps;
  final int? qualifiedToQuotationBps;
  final int? quotationToNegotiationBps;
  final int? negotiationToWonBps;
  final int? overallBps;

  factory FunnelReportConversion.fromJson(Map<String, dynamic> json) {
    return FunnelReportConversion(
      leadToQualifiedBps: json['leadToQualifiedBps'] as int?,
      qualifiedToQuotationBps: json['qualifiedToQuotationBps'] as int?,
      quotationToNegotiationBps: json['quotationToNegotiationBps'] as int?,
      negotiationToWonBps: json['negotiationToWonBps'] as int?,
      overallBps: json['overallBps'] as int?,
    );
  }
}

class FunnelTrendPoint {
  const FunnelTrendPoint({
    required this.date,
    required this.label,
    required this.values,
  });

  final String date;
  final String label;
  final Map<String, int> values;

  factory FunnelTrendPoint.fromJson(Map<String, dynamic> json) {
    return FunnelTrendPoint(
      date: json['date'] as String? ?? '',
      label: json['label'] as String? ?? '',
      values: {
        for (final code in const ['lead', 'qualified', 'quotation', 'negotiation', 'won'])
          code: json[code] as int? ?? 0,
      },
    );
  }
}

class FunnelReport {
  const FunnelReport({
    required this.generatedAt,
    required this.timezone,
    required this.today,
    required this.month,
    this.stages = const [],
    this.conversion = const FunnelReportConversion(),
    this.funnelChart = const [],
    this.currentChart = const [],
    this.conversionChart = const [],
    this.trend = const [],
  });

  final DateTime generatedAt;
  final String timezone;
  final String today;
  final DashboardPeriod month;
  final List<FunnelReportStage> stages;
  final FunnelReportConversion conversion;
  final List<DashboardMixSlice> funnelChart;
  final List<DashboardMixSlice> currentChart;
  final List<DashboardMixSlice> conversionChart;
  final List<FunnelTrendPoint> trend;

  factory FunnelReport.fromJson(Map<String, dynamic> json) {
    final charts = json['charts'] as Map<String, dynamic>? ?? const {};
    return FunnelReport(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      month: DashboardPeriod.fromJson(json['month'] as Map<String, dynamic>? ?? const {}),
      stages: [
        for (final item in json['stages'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) FunnelReportStage.fromJson(item),
      ],
      conversion: FunnelReportConversion.fromJson(
        json['conversion'] as Map<String, dynamic>? ?? const {},
      ),
      funnelChart: [
        for (final item in charts['funnel'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardMixSlice.fromJson(item),
      ],
      currentChart: [
        for (final item in charts['current'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardMixSlice.fromJson(item),
      ],
      conversionChart: [
        for (final item in charts['conversion'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) DashboardMixSlice.fromJson(item),
      ],
      trend: [
        for (final item in charts['trend'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) FunnelTrendPoint.fromJson(item),
      ],
    );
  }
}
