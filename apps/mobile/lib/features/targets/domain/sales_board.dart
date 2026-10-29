/// Models behind the Monthly Sales Target screen: the gauge card, the
/// leaderboard, the day-by-day trail and the nudges.
///
/// Money arrives from the API in minor currency (paise). Formatting to the
/// Indian lakh/crore short form lives here so the gauge, the ranking and the
/// insights table all read the same way.
library;

String formatBoardValue(num value, {required bool money}) {
  if (!money) {
    final rounded = value.roundToDouble();
    return rounded == value ? value.toStringAsFixed(0) : value.toStringAsFixed(1);
  }
  final major = value / 100;
  final abs = major.abs();
  if (abs >= 10000000) {
    return '₹${_trim(major / 10000000)}Cr';
  }
  if (abs >= 100000) {
    return '₹${_trim(major / 100000)}L';
  }
  if (abs >= 1000) {
    return '₹${_trim(major / 1000)}K';
  }
  return '₹${major.toStringAsFixed(0)}';
}

/// Signed short form, for the forecast delta chip: `+₹10K`, `-₹4.2L`.
String formatBoardDelta(num value, {required bool money}) {
  final sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return '$sign${formatBoardValue(value.abs(), money: money)}';
}

/// One decimal, dropped when it is zero: `18.5L`, but `15L` not `15.0L`.
/// The decimal is kept at every scale — `₹18.5L` and `₹19L` are a 50,000
/// rupee difference, which is not rounding noise on a target card.
String _trim(double value) {
  final text = value.toStringAsFixed(1);
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

String formatBps(int? bps) => bps == null ? '—' : '${(bps / 100).round()}%';

class SalesBoardOption {
  const SalesBoardOption({required this.code, required this.title});

  final String code;
  final String title;

  factory SalesBoardOption.fromJson(Map<String, dynamic> json) {
    return SalesBoardOption(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
    );
  }
}

class SalesBoardPeriod {
  const SalesBoardPeriod({
    required this.code,
    required this.title,
    required this.start,
    required this.end,
    required this.label,
  });

  final String code;
  final String title;
  final String start;
  final String end;
  final String label;

  factory SalesBoardPeriod.fromJson(Map<String, dynamic> json) {
    return SalesBoardPeriod(
      code: json['code'] as String? ?? 'this_month',
      title: json['title'] as String? ?? '',
      start: json['start'] as String? ?? '',
      end: json['end'] as String? ?? '',
      label: json['label'] as String? ?? '',
    );
  }
}

class SalesBoardPace {
  const SalesBoardPace({required this.status, required this.title, required this.detail});

  final String status;
  final String title;
  final String detail;

  bool get onTrack => status == 'on_track';

  factory SalesBoardPace.fromJson(Map<String, dynamic> json) {
    return SalesBoardPace(
      status: json['status'] as String? ?? 'on_track',
      title: json['title'] as String? ?? '',
      detail: json['detail'] as String? ?? '',
    );
  }
}

class SalesBoardCard {
  const SalesBoardCard({
    required this.name,
    required this.targetValue,
    required this.achievedValue,
    required this.dailyAverage,
    required this.pace,
    this.membershipId,
    this.remaining = 0,
    this.achievementBps,
    this.elapsedBps,
    this.daysTotal = 0,
    this.daysElapsed = 0,
    this.daysRemaining = 0,
    this.dailyRequired,
    this.forecastValue,
    this.forecastBps,
    this.forecastBand,
    this.forecastDelta,
    this.onTrack = true,
    this.rank,
    this.rankOf = 0,
  });

  final String? membershipId;
  final String name;
  final double targetValue;
  final double achievedValue;
  final double remaining;
  final double dailyAverage;
  final int? achievementBps;
  final int? elapsedBps;
  final int daysTotal;
  final int daysElapsed;
  final int daysRemaining;
  final double? dailyRequired;
  final double? forecastValue;
  final int? forecastBps;
  final String? forecastBand;
  final double? forecastDelta;
  final bool onTrack;
  final int? rank;
  final int rankOf;
  final SalesBoardPace pace;

  /// Gauge sweep, clamped so an over-achiever does not draw past full.
  double get fraction => ((achievementBps ?? 0).clamp(0, 10000)) / 10000;

  String get percentLabel => formatBps(achievementBps);
  String get rankLabel => rank == null ? '—' : '#$rank';

  factory SalesBoardCard.fromJson(Map<String, dynamic> json) {
    return SalesBoardCard(
      membershipId: json['membershipId'] as String?,
      name: json['name'] as String? ?? '',
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      remaining: (json['remaining'] as num?)?.toDouble() ?? 0,
      dailyAverage: (json['dailyAverage'] as num?)?.toDouble() ?? 0,
      achievementBps: json['achievementBps'] as int?,
      elapsedBps: json['elapsedBps'] as int?,
      daysTotal: json['daysTotal'] as int? ?? 0,
      daysElapsed: json['daysElapsed'] as int? ?? 0,
      daysRemaining: json['daysRemaining'] as int? ?? 0,
      dailyRequired: (json['dailyRequired'] as num?)?.toDouble(),
      forecastValue: (json['forecastValue'] as num?)?.toDouble(),
      forecastBps: json['forecastBps'] as int?,
      forecastBand: json['forecastBand'] as String?,
      forecastDelta: (json['forecastDelta'] as num?)?.toDouble(),
      onTrack: json['onTrack'] as bool? ?? true,
      rank: json['rank'] as int?,
      rankOf: json['rankOf'] as int? ?? 0,
      pace: SalesBoardPace.fromJson(json['pace'] as Map<String, dynamic>? ?? const {}),
    );
  }
}

class SalesBoardStanding {
  const SalesBoardStanding({
    required this.membershipId,
    required this.name,
    required this.rank,
    required this.targetValue,
    required this.achievedValue,
    this.designation,
    this.teamName,
    this.achievementBps,
    this.onTrack = true,
  });

  final String membershipId;
  final String name;
  final String? designation;
  final String? teamName;
  final int rank;
  final double targetValue;
  final double achievedValue;
  final int? achievementBps;
  final bool onTrack;

  factory SalesBoardStanding.fromJson(Map<String, dynamic> json) {
    return SalesBoardStanding(
      membershipId: json['membershipId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      designation: json['designation'] as String?,
      teamName: json['teamName'] as String?,
      rank: json['rank'] as int? ?? 0,
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      achievementBps: json['achievementBps'] as int?,
      onTrack: json['onTrack'] as bool? ?? true,
    );
  }
}

class SalesBoardInsight {
  const SalesBoardInsight({
    required this.date,
    required this.value,
    required this.cumulative,
    required this.runningAverage,
  });

  final String date;
  final double value;
  final double cumulative;
  final double runningAverage;

  /// `21 Sep` — the Insights table has no room for the year.
  String get dayLabel {
    if (date.length < 10) {
      return date;
    }
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final month = int.tryParse(date.substring(5, 7)) ?? 1;
    return '${date.substring(8, 10)} ${months[(month - 1).clamp(0, 11)]}';
  }

  factory SalesBoardInsight.fromJson(Map<String, dynamic> json) {
    return SalesBoardInsight(
      date: json['date'] as String? ?? '',
      value: (json['value'] as num?)?.toDouble() ?? 0,
      cumulative: (json['cumulative'] as num?)?.toDouble() ?? 0,
      runningAverage: (json['runningAverage'] as num?)?.toDouble() ?? 0,
    );
  }
}

class SalesBoardSuggestion {
  const SalesBoardSuggestion({
    required this.code,
    required this.title,
    required this.detail,
  });

  final String code;
  final String title;
  final String detail;

  factory SalesBoardSuggestion.fromJson(Map<String, dynamic> json) {
    return SalesBoardSuggestion(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      detail: json['detail'] as String? ?? '',
    );
  }
}

class SalesBoard {
  const SalesBoard({
    required this.generatedAt,
    required this.timeZone,
    required this.today,
    required this.period,
    required this.overall,
    required this.metricCode,
    required this.metricName,
    required this.metricUnit,
    this.scope = 'tenant',
    this.me,
    this.periods = const [],
    this.scopes = const [],
    this.standings = const [],
    this.podium = const [],
    this.insights = const [],
    this.suggestions = const [],
  });

  final DateTime generatedAt;
  final String timeZone;
  final String today;
  final SalesBoardPeriod period;
  final List<SalesBoardOption> periods;
  final List<SalesBoardOption> scopes;
  final String scope;
  final String metricCode;
  final String metricName;
  final String metricUnit;
  final SalesBoardCard? me;
  final SalesBoardCard overall;
  final List<SalesBoardStanding> standings;
  final List<SalesBoardStanding> podium;
  final List<SalesBoardInsight> insights;
  final List<SalesBoardSuggestion> suggestions;

  bool get isMoney => metricUnit == 'minor_currency';
  bool get hasPersonalCard => me != null;

  /// The card the screen is showing: the viewer's own when the "My Target"
  /// toggle is on and they have one, the roll-up otherwise.
  SalesBoardCard card({required bool mine}) => mine ? (me ?? overall) : overall;

  String format(num value) => formatBoardValue(value, money: isMoney);
  String formatDelta(num value) => formatBoardDelta(value, money: isMoney);

  factory SalesBoard.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [
        for (final item in items)
          if (item is Map<String, dynamic>) parse(item),
      ];
    }

    final metric = json['metric'] as Map<String, dynamic>? ?? const {};
    final me = json['me'] as Map<String, dynamic>?;
    return SalesBoard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timeZone: json['timeZone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      period: SalesBoardPeriod.fromJson(json['period'] as Map<String, dynamic>? ?? const {}),
      periods: list('periods', SalesBoardOption.fromJson),
      scopes: list('scopes', SalesBoardOption.fromJson),
      scope: json['scope'] as String? ?? 'tenant',
      metricCode: metric['code'] as String? ?? 'revenue',
      metricName: metric['name'] as String? ?? 'Revenue',
      metricUnit: metric['unit'] as String? ?? 'minor_currency',
      me: me == null ? null : SalesBoardCard.fromJson(me),
      overall: SalesBoardCard.fromJson(json['overall'] as Map<String, dynamic>? ?? const {}),
      standings: list('standings', SalesBoardStanding.fromJson),
      podium: list('podium', SalesBoardStanding.fromJson),
      insights: list('insights', SalesBoardInsight.fromJson),
      suggestions: list('suggestions', SalesBoardSuggestion.fromJson),
    );
  }
}
