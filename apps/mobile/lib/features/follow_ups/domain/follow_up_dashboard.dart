import '../../leads/data/lead_dto.dart';
import '../../leads/domain/lead.dart';

class FollowUpGap {
  const FollowUpGap({
    required this.leadId,
    required this.leadNumber,
    required this.leadTitle,
    this.ownerName,
  });

  final String leadId;
  final String leadNumber;
  final String leadTitle;
  final String? ownerName;

  factory FollowUpGap.fromJson(Map<String, dynamic> json) {
    return FollowUpGap(
      leadId: json['leadId'] as String? ?? '',
      leadNumber: json['leadNumber'] as String? ?? '',
      leadTitle: json['leadTitle'] as String? ?? '',
      ownerName: json['ownerName'] as String?,
    );
  }
}

class FollowUpEngineRule {
  const FollowUpEngineRule({
    required this.level,
    required this.title,
    required this.hours,
    required this.audience,
  });

  final int level;
  final String title;
  final int hours;
  final String audience;

  factory FollowUpEngineRule.fromJson(Map<String, dynamic> json) {
    return FollowUpEngineRule(
      level: json['level'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      hours: json['hours'] as int? ?? 0,
      audience: json['audience'] as String? ?? '',
    );
  }
}

class FollowUpDashboardWidget {
  const FollowUpDashboardWidget({
    required this.code,
    required this.title,
    required this.count,
    this.followUps = const [],
    this.gaps = const [],
  });

  final String code;
  final String title;
  final int count;
  final List<LeadFollowUp> followUps;
  final List<FollowUpGap> gaps;

  factory FollowUpDashboardWidget.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    if (json['code'] == 'no_follow_up') {
      return FollowUpDashboardWidget(
        code: json['code'] as String? ?? '',
        title: json['title'] as String? ?? '',
        count: json['count'] as int? ?? 0,
        gaps: [
          for (final item in items)
            if (item is Map<String, dynamic>) FollowUpGap.fromJson(item),
        ],
      );
    }
    return FollowUpDashboardWidget(
      code: json['code'] as String? ?? '',
      title: json['title'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      followUps: [
        for (final item in items)
          if (item is Map<String, dynamic>) LeadFollowUpDto.fromJson(item).toDomain(),
      ],
    );
  }
}

class FollowUpDashboard {
  const FollowUpDashboard({
    required this.generatedAt,
    required this.timezone,
    required this.widgets,
    this.rules = const [],
    this.overduePastManagerSla = 0,
    this.overduePastAdminSla = 0,
  });

  final DateTime generatedAt;
  final String timezone;
  final List<FollowUpDashboardWidget> widgets;
  final List<FollowUpEngineRule> rules;
  final int overduePastManagerSla;
  final int overduePastAdminSla;

  factory FollowUpDashboard.fromJson(Map<String, dynamic> json) {
    final widgets = json['widgets'] as List<dynamic>? ?? const [];
    final escalation = json['escalation'] as Map<String, dynamic>? ?? const {};
    final rules = escalation['rules'] as List<dynamic>? ?? const [];
    return FollowUpDashboard(
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
      widgets: [
        for (final item in widgets)
          if (item is Map<String, dynamic>) FollowUpDashboardWidget.fromJson(item),
      ],
      rules: [
        for (final item in rules)
          if (item is Map<String, dynamic>) FollowUpEngineRule.fromJson(item),
      ],
      overduePastManagerSla: escalation['overduePastManagerSla'] as int? ?? 0,
      overduePastAdminSla: escalation['overduePastAdminSla'] as int? ?? 0,
    );
  }

  FollowUpDashboardWidget? widget(String code) {
    for (final item in widgets) {
      if (item.code == code) {
        return item;
      }
    }
    return null;
  }
}
