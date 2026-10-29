/// One audit-trail entry from `GET /leads/:leadId/tracks`.
class TrackRow {
  const TrackRow({
    required this.id,
    required this.action,
    required this.actionName,
    required this.resourceType,
    required this.createdAt,
    this.actorName,
    this.summary,
    this.number,
  });

  final String id;
  final String action;
  final String actionName;
  final String resourceType;
  final DateTime createdAt;
  final String? actorName;
  final String? summary;
  final String? number;

  String get title => actionName.isNotEmpty ? actionName : action;

  factory TrackRow.fromJson(Map<String, dynamic> json) {
    return TrackRow(
      id: json['id'] as String,
      action: json['action'] as String? ?? '',
      actionName: json['actionName'] as String? ?? '',
      resourceType: json['resourceType'] as String? ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
      actorName: json['actorName'] as String?,
      summary: json['summary'] as String?,
      number: json['number'] as String?,
    );
  }
}
