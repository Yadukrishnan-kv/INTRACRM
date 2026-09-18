class PerformanceKpi {
  const PerformanceKpi({
    required this.code,
    required this.title,
    required this.weightBps,
  });

  final String code;
  final String title;
  final int weightBps;

  factory PerformanceKpi.fromJson(Map<String, dynamic> json) {
    return PerformanceKpi(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      weightBps: json['weightBps'] as int? ?? 0,
    );
  }
}

class PerformanceOption {
  const PerformanceOption({required this.id, required this.name});

  final String id;
  final String name;

  factory PerformanceOption.fromJson(Map<String, dynamic> json, {String idKey = 'id'}) {
    return PerformanceOption(
      id: json[idKey] as String? ?? json['id'] as String? ?? json['code'] as String? ?? '',
      name: json['title'] as String? ?? json['name'] as String? ?? '',
    );
  }
}

class PerformanceCatalog {
  const PerformanceCatalog({
    this.periods = const [],
    this.kpis = const [],
    this.teams = const [],
  });

  final List<PerformanceOption> periods;
  final List<PerformanceKpi> kpis;
  final List<PerformanceOption> teams;

  factory PerformanceCatalog.fromJson(Map<String, dynamic> json) {
    List<PerformanceOption> named(String key, {String idKey = 'code'}) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [
        for (final item in items)
          if (item is Map<String, dynamic>) PerformanceOption.fromJson(item, idKey: idKey),
      ];
    }

    return PerformanceCatalog(
      periods: named('periods'),
      kpis: [
        for (final item in json['kpis'] as List<dynamic>? ?? const [])
          if (item is Map<String, dynamic>) PerformanceKpi.fromJson(item),
      ],
      teams: named('teams', idKey: 'id'),
    );
  }
}

class StaffPerformance {
  const StaffPerformance({
    required this.membershipId,
    required this.name,
    required this.rank,
    required this.rankedOutOf,
    this.designation,
    this.teamId,
    this.teamName,
    this.leadsCreated = 0,
    this.leadsWon = 0,
    this.leadsLost = 0,
    this.followUpsDue = 0,
    this.followUpsCompleted = 0,
    this.quotationsSent = 0,
    this.quotationsWon = 0,
    this.quotationsLost = 0,
    this.revenueMinor = 0,
    this.salesTargetMinor,
    this.leadConversionBps,
    this.followUpCompletionBps,
    this.salesAchievementBps,
    this.quotationConversionBps,
    this.scoreBps,
    this.scoreBand = 'no_data',
    this.teamRank,
  });

  final String membershipId;
  final String name;
  final String? designation;
  final String? teamId;
  final String? teamName;
  final int leadsCreated;
  final int leadsWon;
  final int leadsLost;
  final int followUpsDue;
  final int followUpsCompleted;
  final int quotationsSent;
  final int quotationsWon;
  final int quotationsLost;
  final int revenueMinor;
  final double? salesTargetMinor;
  final int? leadConversionBps;
  final int? followUpCompletionBps;
  final int? salesAchievementBps;
  final int? quotationConversionBps;
  final int? scoreBps;
  final String scoreBand;
  final int rank;
  final int? teamRank;
  final int rankedOutOf;

  String get scoreLabel => bpsLabel(scoreBps);
  String get bandLabel => PerformanceBands.title(scoreBand);
  String get rankLabel => '#$rank';

  factory StaffPerformance.fromJson(Map<String, dynamic> json) {
    return StaffPerformance(
      membershipId: json['membershipId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      designation: json['designation'] as String?,
      teamId: json['teamId'] as String?,
      teamName: json['teamName'] as String?,
      leadsCreated: json['leadsCreated'] as int? ?? 0,
      leadsWon: json['leadsWon'] as int? ?? 0,
      leadsLost: json['leadsLost'] as int? ?? 0,
      followUpsDue: json['followUpsDue'] as int? ?? 0,
      followUpsCompleted: json['followUpsCompleted'] as int? ?? 0,
      quotationsSent: json['quotationsSent'] as int? ?? 0,
      quotationsWon: json['quotationsWon'] as int? ?? 0,
      quotationsLost: json['quotationsLost'] as int? ?? 0,
      revenueMinor: json['revenueMinor'] as int? ?? 0,
      salesTargetMinor: (json['salesTargetMinor'] as num?)?.toDouble(),
      leadConversionBps: json['leadConversionBps'] as int?,
      followUpCompletionBps: json['followUpCompletionBps'] as int?,
      salesAchievementBps: json['salesAchievementBps'] as int?,
      quotationConversionBps: json['quotationConversionBps'] as int?,
      scoreBps: json['scoreBps'] as int?,
      scoreBand: json['scoreBand'] as String? ?? 'no_data',
      rank: json['rank'] as int? ?? 0,
      teamRank: json['teamRank'] as int?,
      rankedOutOf: json['rankedOutOf'] as int? ?? 0,
    );
  }
}

class PerformancePeriod {
  const PerformancePeriod({
    required this.type,
    required this.start,
    required this.end,
    required this.label,
  });

  final String type;
  final String start;
  final String end;
  final String label;

  factory PerformancePeriod.fromJson(Map<String, dynamic> json) {
    return PerformancePeriod(
      type: json['type'] as String? ?? 'monthly',
      start: json['start'] as String? ?? '',
      end: json['end'] as String? ?? '',
      label: json['label'] as String? ?? '',
    );
  }
}

class PerformanceLeaderboards {
  const PerformanceLeaderboards({
    this.overall = const [],
    this.leadConversion = const [],
    this.followUpCompletion = const [],
    this.salesAchievement = const [],
    this.quotationConversion = const [],
  });

  final List<StaffPerformance> overall;
  final List<StaffPerformance> leadConversion;
  final List<StaffPerformance> followUpCompletion;
  final List<StaffPerformance> salesAchievement;
  final List<StaffPerformance> quotationConversion;

  factory PerformanceLeaderboards.fromJson(Map<String, dynamic> json) {
    List<StaffPerformance> list(String key) {
      final items = json[key] as List<dynamic>? ?? const [];
      return [
        for (final item in items)
          if (item is Map<String, dynamic>) StaffPerformance.fromJson(item),
      ];
    }

    return PerformanceLeaderboards(
      overall: list('overall'),
      leadConversion: list('leadConversion'),
      followUpCompletion: list('followUpCompletion'),
      salesAchievement: list('salesAchievement'),
      quotationConversion: list('quotationConversion'),
    );
  }
}

class PerformanceBoard {
  const PerformanceBoard({
    required this.generatedAt,
    required this.period,
    required this.rankedOutOf,
    this.standings = const [],
    this.leaderboards = const PerformanceLeaderboards(),
  });

  final DateTime generatedAt;
  final PerformancePeriod period;
  final int rankedOutOf;
  final List<StaffPerformance> standings;
  final PerformanceLeaderboards leaderboards;

  factory PerformanceBoard.fromJson(Map<String, dynamic> json) {
    final standings = json['standings'] as List<dynamic>? ?? const [];
    return PerformanceBoard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      period: PerformancePeriod.fromJson(json['period'] as Map<String, dynamic>? ?? const {}),
      rankedOutOf: json['rankedOutOf'] as int? ?? standings.length,
      standings: [
        for (final item in standings)
          if (item is Map<String, dynamic>) StaffPerformance.fromJson(item),
      ],
      leaderboards: PerformanceLeaderboards.fromJson(
        json['leaderboards'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class PerformanceCard {
  const PerformanceCard({
    required this.period,
    required this.staff,
    this.neighbors = const [],
  });

  final PerformancePeriod period;
  final StaffPerformance staff;
  final List<StaffPerformance> neighbors;

  factory PerformanceCard.fromJson(Map<String, dynamic> json) {
    final neighbors = json['neighbors'] as List<dynamic>? ?? const [];
    return PerformanceCard(
      period: PerformancePeriod.fromJson(json['period'] as Map<String, dynamic>? ?? const {}),
      staff: StaffPerformance.fromJson(json['staff'] as Map<String, dynamic>? ?? const {}),
      neighbors: [
        for (final item in neighbors)
          if (item is Map<String, dynamic>) StaffPerformance.fromJson(item),
      ],
    );
  }
}

class PerformanceReport {
  const PerformanceReport({
    required this.period,
    required this.staff,
    required this.scored,
    this.averageScoreBps,
    this.outstanding = 0,
    this.strong = 0,
    this.average = 0,
    this.needsWork = 0,
    this.noData = 0,
    this.top = const [],
    this.byTeam = const [],
    this.leaderboards = const PerformanceLeaderboards(),
  });

  final PerformancePeriod period;
  final int staff;
  final int scored;
  final int? averageScoreBps;
  final int outstanding;
  final int strong;
  final int average;
  final int needsWork;
  final int noData;
  final List<StaffPerformance> top;
  final List<PerformanceTeamRow> byTeam;
  final PerformanceLeaderboards leaderboards;

  factory PerformanceReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    final top = json['top'] as List<dynamic>? ?? const [];
    final byTeam = json['byTeam'] as List<dynamic>? ?? const [];
    return PerformanceReport(
      period: PerformancePeriod.fromJson(json['period'] as Map<String, dynamic>? ?? const {}),
      staff: totals['staff'] as int? ?? 0,
      scored: totals['scored'] as int? ?? 0,
      averageScoreBps: totals['averageScoreBps'] as int?,
      outstanding: totals['outstanding'] as int? ?? 0,
      strong: totals['strong'] as int? ?? 0,
      average: totals['average'] as int? ?? 0,
      needsWork: totals['needsWork'] as int? ?? 0,
      noData: totals['noData'] as int? ?? 0,
      top: [
        for (final item in top)
          if (item is Map<String, dynamic>) StaffPerformance.fromJson(item),
      ],
      byTeam: [
        for (final item in byTeam)
          if (item is Map<String, dynamic>) PerformanceTeamRow.fromJson(item),
      ],
      leaderboards: PerformanceLeaderboards.fromJson(
        json['leaderboards'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class PerformanceTeamRow {
  const PerformanceTeamRow({
    required this.teamId,
    required this.teamName,
    required this.count,
    this.averageScoreBps,
  });

  final String teamId;
  final String teamName;
  final int count;
  final int? averageScoreBps;

  factory PerformanceTeamRow.fromJson(Map<String, dynamic> json) {
    return PerformanceTeamRow(
      teamId: json['teamId'] as String? ?? '',
      teamName: json['teamName'] as String? ?? 'Team',
      count: json['count'] as int? ?? 0,
      averageScoreBps: json['averageScoreBps'] as int?,
    );
  }
}

class PerformanceBands {
  static String title(String band) {
    return switch (band) {
      'outstanding' => 'Outstanding',
      'strong' => 'Strong',
      'average' => 'Average',
      'needs_work' => 'Needs work',
      'no_data' => 'No data',
      _ => band,
    };
  }
}

class PerformanceBoards {
  static const overall = 'overall';
  static const leadConversion = 'leadConversion';
  static const followUpCompletion = 'followUpCompletion';
  static const salesAchievement = 'salesAchievement';
  static const quotationConversion = 'quotationConversion';

  static String title(String code) {
    return switch (code) {
      overall => 'Overall',
      leadConversion => 'Lead conversion',
      followUpCompletion => 'Follow-ups',
      salesAchievement => 'Sales',
      quotationConversion => 'Quotations',
      _ => code,
    };
  }
}

String bpsLabel(int? bps) => bps == null ? '—' : '${(bps / 100).toStringAsFixed(0)}%';
