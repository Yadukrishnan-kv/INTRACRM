class TargetMetric {
  const TargetMetric({
    required this.code,
    required this.name,
    required this.unit,
    this.description,
  });

  final String code;
  final String name;
  final String unit;
  final String? description;

  bool get isMoney => unit == 'minor_currency';

  factory TargetMetric.fromJson(Map<String, dynamic> json) {
    return TargetMetric(
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      unit: json['unit'] as String? ?? 'count',
      description: json['description'] as String?,
    );
  }
}

class TargetOption {
  const TargetOption({required this.id, required this.name, this.code, this.teamId});

  final String id;
  final String name;
  final String? code;
  final String? teamId;

  factory TargetOption.fromJson(Map<String, dynamic> json, {String idKey = 'id'}) {
    return TargetOption(
      id: json[idKey] as String? ?? json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      code: json['code'] as String?,
      teamId: json['teamId'] as String?,
    );
  }
}

class TargetCatalog {
  const TargetCatalog({
    this.periods = const [],
    this.scopes = const [],
    this.metrics = const [],
    this.teams = const [],
    this.products = const [],
    this.staff = const [],
  });

  final List<TargetOption> periods;
  final List<TargetOption> scopes;
  final List<TargetMetric> metrics;
  final List<TargetOption> teams;
  final List<TargetOption> products;
  final List<TargetOption> staff;

  factory TargetCatalog.fromJson(Map<String, dynamic> json) {
    List<TargetOption> options(String key, {String idKey = 'code'}) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [
        for (final item in items)
          if (item is Map<String, dynamic>)
            TargetOption(
              id: item[idKey] as String? ?? item['id'] as String? ?? '',
              name: item['title'] as String? ?? item['name'] as String? ?? '',
              code: item['code'] as String?,
            ),
      ];
    }

    return TargetCatalog(
      periods: options('periods'),
      scopes: options('scopes'),
      metrics: [
        for (final item in json['metrics'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TargetMetric.fromJson(item),
      ],
      teams: [
        for (final item in json['teams'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TargetOption.fromJson(item),
      ],
      products: [
        for (final item in json['products'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) TargetOption.fromJson(item),
      ],
      staff: [
        for (final item in json['staff'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>)
            TargetOption.fromJson({...item, 'id': item['membershipId'], 'name': item['name']}),
      ],
    );
  }
}

class Target {
  const Target({
    required this.id,
    required this.scopeType,
    required this.metricCode,
    required this.metricName,
    required this.metricUnit,
    required this.periodType,
    required this.periodStart,
    required this.periodEnd,
    required this.periodLabel,
    required this.targetValue,
    required this.achievedValue,
    required this.remaining,
    required this.version,
    this.scopeId,
    this.scopeName,
    this.productId,
    this.productName,
    this.productSku,
    this.kinds = const [],
    this.balance,
    this.achievementBps,
    this.attainmentBps,
    this.elapsedBps,
    this.daysTotal = 0,
    this.daysElapsed = 0,
    this.daysRemaining = 0,
    this.plannedDaily = 0,
    this.dailyRequired,
    this.expectedValue = 0,
    this.variance = 0,
    this.forecastValue,
    this.forecastBps,
    this.forecastBand,
    this.onTrack = true,
    this.notes,
  });

  final String id;
  final String scopeType;
  final String? scopeId;
  final String? scopeName;
  final String? productId;
  final String? productName;
  final String? productSku;
  final String metricCode;
  final String metricName;
  final String metricUnit;
  final String periodType;
  final String periodStart;
  final String periodEnd;
  final String periodLabel;
  final List<String> kinds;
  final double targetValue;
  final double achievedValue;
  final double remaining;
  final double? balance;
  final int? achievementBps;
  final int? attainmentBps;
  final int? elapsedBps;
  final int daysTotal;
  final int daysElapsed;
  final int daysRemaining;
  final double plannedDaily;
  final double? dailyRequired;
  final double expectedValue;
  final double variance;
  final double? forecastValue;
  final int? forecastBps;
  final String? forecastBand;
  final bool onTrack;
  final String? notes;
  final int version;

  bool get isMoney => metricUnit == 'minor_currency';
  int? get achievementOrAttainment => achievementBps ?? attainmentBps;
  double get fraction => ((achievementOrAttainment ?? 0).clamp(0, 10000)) / 10000;
  String get percentLabel =>
      achievementOrAttainment == null ? '—' : '${(achievementOrAttainment! / 100).toStringAsFixed(0)}%';
  String get paceLabel => onTrack ? 'On track' : 'Behind';
  double get signedBalance => balance ?? remaining;

  String get forecastLabel => TargetForecast.bandTitle(forecastBand);
  String get forecastPercentLabel =>
      forecastBps == null ? '—' : '${(forecastBps! / 100).toStringAsFixed(0)}%';

  String get displayTitle {
    final product = productName;
    if (product != null && product.isNotEmpty) {
      return '$product · $metricName';
    }
    return '$metricName · ${scopeName ?? scopeType}';
  }

  String formatValue(double value) {
    if (isMoney) {
      return '₹${(value / 100).toStringAsFixed(0)}';
    }
    if (value == value.roundToDouble()) {
      return value.toStringAsFixed(0);
    }
    return value.toStringAsFixed(1);
  }

  String formatRate(double value) {
    if (isMoney) {
      return '₹${(value / 100).toStringAsFixed(2)}';
    }
    if (value == value.roundToDouble()) {
      return value.toStringAsFixed(0);
    }
    return value.toStringAsFixed(1);
  }

  String get targetLabel => formatValue(targetValue);
  String get achievedLabel => formatValue(achievedValue);
  String get balanceLabel => formatValue(signedBalance);
  String get dailyRequiredLabel => dailyRequired == null ? '—' : formatRate(dailyRequired!);
  String get forecastValueLabel => forecastValue == null ? '—' : formatValue(forecastValue!);

  factory Target.fromJson(Map<String, dynamic> json) {
    final kinds = json['kinds'] as List<dynamic>? ?? const [];
    return Target(
      id: json['id'] as String? ?? '',
      scopeType: json['scopeType'] as String? ?? 'tenant',
      scopeId: json['scopeId'] as String?,
      scopeName: json['scopeName'] as String?,
      productId: json['productId'] as String?,
      productName: json['productName'] as String?,
      productSku: json['productSku'] as String?,
      metricCode: json['metricCode'] as String? ?? '',
      metricName: json['metricName'] as String? ?? '',
      metricUnit: json['metricUnit'] as String? ?? 'count',
      periodType: json['periodType'] as String? ?? 'monthly',
      periodStart: json['periodStart'] as String? ?? '',
      periodEnd: json['periodEnd'] as String? ?? '',
      periodLabel: json['periodLabel'] as String? ?? '',
      kinds: [for (final item in kinds) if (item is String) item],
      targetValue: (json['targetValue'] as num?)?.toDouble() ?? 0,
      achievedValue: (json['achievedValue'] as num?)?.toDouble() ?? 0,
      remaining: (json['remaining'] as num?)?.toDouble() ?? 0,
      balance: (json['balance'] as num?)?.toDouble(),
      achievementBps: json['achievementBps'] as int?,
      attainmentBps: json['attainmentBps'] as int?,
      elapsedBps: json['elapsedBps'] as int?,
      daysTotal: json['daysTotal'] as int? ?? 0,
      daysElapsed: json['daysElapsed'] as int? ?? 0,
      daysRemaining: json['daysRemaining'] as int? ?? 0,
      plannedDaily: (json['plannedDaily'] as num?)?.toDouble() ?? 0,
      dailyRequired: (json['dailyRequired'] as num?)?.toDouble(),
      expectedValue: (json['expectedValue'] as num?)?.toDouble() ?? 0,
      variance: (json['variance'] as num?)?.toDouble() ?? 0,
      forecastValue: (json['forecastValue'] as num?)?.toDouble(),
      forecastBps: json['forecastBps'] as int?,
      forecastBand: json['forecastBand'] as String?,
      onTrack: json['onTrack'] as bool? ?? true,
      notes: json['notes'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }
}

class TargetPeriodBucket {
  const TargetPeriodBucket({
    required this.periodStart,
    required this.periodEnd,
    this.items = const [],
  });

  final String periodStart;
  final String periodEnd;
  final List<Target> items;

  factory TargetPeriodBucket.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    return TargetPeriodBucket(
      periodStart: json['periodStart'] as String? ?? '',
      periodEnd: json['periodEnd'] as String? ?? '',
      items: [for (final item in items) if (item is Map<String, dynamic>) Target.fromJson(item)],
    );
  }
}

class TargetProgressDashboard {
  const TargetProgressDashboard({
    required this.generatedAt,
    required this.timeZone,
    required this.month,
    required this.today,
    this.products = const [],
    this.teams = const [],
    this.count = 0,
    this.onTrack = 0,
    this.behind = 0,
    this.averageAttainmentBps,
  });

  final DateTime generatedAt;
  final String timeZone;
  final TargetPeriodBucket month;
  final TargetPeriodBucket today;
  final List<Target> products;
  final List<Target> teams;
  final int count;
  final int onTrack;
  final int behind;
  final int? averageAttainmentBps;

  String get averageLabel =>
      averageAttainmentBps == null ? '—' : '${(averageAttainmentBps! / 100).toStringAsFixed(0)}%';

  factory TargetProgressDashboard.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    List<Target> list(String key) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [for (final item in items) if (item is Map<String, dynamic>) Target.fromJson(item)];
    }

    return TargetProgressDashboard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timeZone: json['timeZone'] as String? ?? 'Asia/Kolkata',
      month: TargetPeriodBucket.fromJson(json['month'] as Map<String, dynamic>? ?? const {}),
      today: TargetPeriodBucket.fromJson(json['today'] as Map<String, dynamic>? ?? const {}),
      products: list('products'),
      teams: list('teams'),
      count: totals['count'] as int? ?? 0,
      onTrack: totals['onTrack'] as int? ?? 0,
      behind: totals['behind'] as int? ?? 0,
      averageAttainmentBps: totals['averageAttainmentBps'] as int?,
    );
  }
}

class TargetReport {
  const TargetReport({
    required this.generatedAt,
    required this.count,
    required this.onTrack,
    required this.behind,
    required this.hit,
    this.missed = 0,
    this.ahead = 0,
    this.atRisk = 0,
    this.averageAttainmentBps,
    this.averageForecastBps,
    this.balance = 0,
    this.byPeriod = const [],
    this.byScope = const [],
    this.byMetric = const [],
    this.byForecast = const [],
    this.products = const [],
    this.teams = const [],
  });

  final DateTime generatedAt;
  final int count;
  final int onTrack;
  final int behind;
  final int hit;
  final int missed;
  final int ahead;
  final int atRisk;
  final int? averageAttainmentBps;
  final int? averageForecastBps;
  final double balance;
  final List<Map<String, dynamic>> byPeriod;
  final List<Map<String, dynamic>> byScope;
  final List<Map<String, dynamic>> byMetric;
  final List<Map<String, dynamic>> byForecast;
  final List<Map<String, dynamic>> products;
  final List<Map<String, dynamic>> teams;

  factory TargetReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    List<Map<String, dynamic>> maps(String key) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [for (final item in items) if (item is Map<String, dynamic>) item];
    }

    return TargetReport(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      count: totals['count'] as int? ?? 0,
      onTrack: totals['onTrack'] as int? ?? 0,
      behind: totals['behind'] as int? ?? 0,
      hit: totals['hit'] as int? ?? 0,
      missed: totals['missed'] as int? ?? 0,
      ahead: totals['ahead'] as int? ?? 0,
      atRisk: totals['atRisk'] as int? ?? 0,
      averageAttainmentBps: totals['averageAttainmentBps'] as int?,
      averageForecastBps: totals['averageForecastBps'] as int?,
      balance: (totals['balance'] as num?)?.toDouble() ?? 0,
      byPeriod: maps('byPeriod'),
      byScope: maps('byScope'),
      byMetric: maps('byMetric'),
      byForecast: maps('byForecast'),
      products: maps('products'),
      teams: maps('teams'),
    );
  }
}

class TargetForecast {
  static String bandTitle(String? band) {
    return switch (band) {
      'hit' => 'Hit',
      'ahead' => 'Ahead',
      'on_track' => 'On track',
      'at_risk' => 'At risk',
      'behind' => 'Behind',
      'missed' => 'Missed',
      'not_started' => 'Not started',
      _ => band ?? '—',
    };
  }
}

class TargetKinds {
  static const monthly = 'monthly';
  static const daily = 'daily';
  static const team = 'team';
  static const product = 'product';

  static String title(String code) {
    return switch (code) {
      monthly => 'Monthly',
      daily => 'Daily',
      team => 'Team',
      product => 'Product',
      'tenant' => 'Company',
      'membership' => 'Staff',
      'quarterly' => 'Quarterly',
      'yearly' => 'Yearly',
      _ => code,
    };
  }
}
