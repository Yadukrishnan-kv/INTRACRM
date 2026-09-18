import '../domain/lead.dart';

DateTime? _parseDate(Object? value) {
  if (value is! String || value.isEmpty) {
    return null;
  }
  return DateTime.tryParse(value);
}

int? _parseInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}

class LeadDto {
  const LeadDto({
    required this.id,
    required this.leadNumber,
    required this.title,
    required this.lifecycleStatus,
    required this.version,
    required this.updatedAt,
    this.customerName,
    this.primaryPhone,
    this.primaryEmail,
    this.city,
    this.requirement,
    this.sourceId,
    this.sourceName,
    this.quality,
    this.estimatedValueMinor,
    this.currency = 'INR',
    this.ownerMembershipId,
    this.ownerName,
    this.stageName,
    this.nextFollowUpAt,
    this.pipelineId,
    this.stageId,
    this.createdAt,
    this.lastActivityAt,
    this.activities = const [],
    this.followUps = const [],
    this.syncStatus,
  });

  final String id;
  final String leadNumber;
  final String title;
  final String lifecycleStatus;
  final String? customerName;
  final String? primaryPhone;
  final String? primaryEmail;
  final String? city;
  final String? requirement;
  final String? sourceId;
  final String? sourceName;
  final String? quality;
  final int? estimatedValueMinor;
  final String currency;
  final String? ownerMembershipId;
  final String? ownerName;
  final String? stageName;
  final DateTime? nextFollowUpAt;
  final String? pipelineId;
  final String? stageId;
  final DateTime? createdAt;
  final DateTime? lastActivityAt;
  final List<LeadActivity> activities;
  final List<LeadFollowUp> followUps;
  final int version;
  final DateTime updatedAt;
  final String? syncStatus;

  factory LeadDto.fromJson(Map<String, dynamic> json) {
    return LeadDto(
      id: json['id'] as String,
      leadNumber: json['leadNumber'] as String? ?? '',
      title: json['title'] as String? ?? '',
      lifecycleStatus: json['lifecycleStatus'] as String? ?? 'open',
      customerName: json['customerName'] as String?,
      primaryPhone: json['primaryPhone'] as String?,
      primaryEmail: json['primaryEmail'] as String?,
      city: json['city'] as String?,
      requirement: json['requirement'] as String?,
      sourceId: json['sourceId'] as String?,
      sourceName: json['sourceName'] as String?,
      quality: json['quality'] as String?,
      estimatedValueMinor: _parseInt(json['estimatedValueMinor']),
      currency: json['currency'] as String? ?? 'INR',
      ownerMembershipId: json['ownerMembershipId'] as String?,
      ownerName: json['ownerName'] as String?,
      stageName: json['stageName'] as String?,
      nextFollowUpAt: _parseDate(json['nextFollowUpAt']),
      pipelineId: json['pipelineId'] as String?,
      stageId: json['stageId'] as String?,
      createdAt: _parseDate(json['createdAt']),
      lastActivityAt: _parseDate(json['lastActivityAt']),
      activities: [
        for (final item in json['activities'] as List? ?? const [])
          if (item is Map<String, dynamic>) LeadActivityDto.fromJson(item).toDomain(),
      ],
      followUps: [
        for (final item in json['followUps'] as List? ?? const [])
          if (item is Map<String, dynamic>) LeadFollowUpDto.fromJson(item).toDomain(),
      ],
      version: json['version'] as int? ?? 1,
      updatedAt: _parseDate(json['updatedAt']) ?? DateTime.now().toUtc(),
      syncStatus: json['syncStatus'] as String?,
    );
  }

  Lead toDomain() {
    return Lead(
      id: id,
      leadNumber: leadNumber,
      title: title,
      lifecycleStatus: lifecycleStatus,
      customerName: customerName,
      primaryPhone: primaryPhone,
      primaryEmail: primaryEmail,
      city: city,
      requirement: requirement,
      sourceId: sourceId,
      sourceName: sourceName,
      quality: quality,
      estimatedValueMinor: estimatedValueMinor,
      currency: currency,
      ownerMembershipId: ownerMembershipId,
      ownerName: ownerName,
      stageName: stageName,
      nextFollowUpAt: nextFollowUpAt,
      pipelineId: pipelineId,
      stageId: stageId,
      createdAt: createdAt,
      lastActivityAt: lastActivityAt,
      activities: activities,
      followUps: followUps,
      version: version,
      updatedAt: updatedAt,
      syncStatus: syncStatus,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'leadNumber': leadNumber,
      'title': title,
      'lifecycleStatus': lifecycleStatus,
      'customerName': customerName,
      'primaryPhone': primaryPhone,
      'primaryEmail': primaryEmail,
      'city': city,
      'requirement': requirement,
      'sourceId': sourceId,
      'sourceName': sourceName,
      'quality': quality,
      'estimatedValueMinor': estimatedValueMinor,
      'currency': currency,
      'ownerMembershipId': ownerMembershipId,
      'ownerName': ownerName,
      'stageName': stageName,
      'nextFollowUpAt': nextFollowUpAt?.toIso8601String(),
      'pipelineId': pipelineId,
      'stageId': stageId,
      'createdAt': createdAt?.toIso8601String(),
      'lastActivityAt': lastActivityAt?.toIso8601String(),
      'version': version,
      'updatedAt': updatedAt.toIso8601String(),
      if (syncStatus != null) 'syncStatus': syncStatus,
    };
  }
}

class LeadActivityDto {
  const LeadActivityDto({
    required this.id,
    required this.type,
    required this.occurredAt,
    this.leadId,
    this.subject,
    this.body,
    this.actorName,
    this.version = 1,
    this.updatedAt,
    this.syncStatus,
  });

  final String id;
  final String? leadId;
  final String type;
  final String? subject;
  final String? body;
  final DateTime occurredAt;
  final String? actorName;
  final int version;
  final DateTime? updatedAt;
  final String? syncStatus;

  factory LeadActivityDto.fromJson(Map<String, dynamic> json) {
    return LeadActivityDto(
      id: json['id'] as String,
      leadId: json['leadId'] as String?,
      type: json['type'] as String? ?? 'note',
      subject: json['subject'] as String?,
      body: json['body'] as String?,
      occurredAt: _parseDate(json['occurredAt']) ?? DateTime.now().toUtc(),
      actorName: json['actorName'] as String?,
      version: json['version'] as int? ?? 1,
      updatedAt: _parseDate(json['updatedAt']),
      syncStatus: json['syncStatus'] as String?,
    );
  }

  LeadActivity toDomain() {
    return LeadActivity(
      id: id,
      type: type,
      subject: subject,
      body: body,
      occurredAt: occurredAt,
      actorName: actorName,
      syncStatus: syncStatus,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'leadId': leadId,
      'type': type,
      'subject': subject,
      'body': body,
      'occurredAt': occurredAt.toIso8601String(),
      'actorName': actorName,
      'version': version,
      'updatedAt': (updatedAt ?? occurredAt).toIso8601String(),
      if (syncStatus != null) 'syncStatus': syncStatus,
    };
  }
}

class LeadFollowUpDto {
  const LeadFollowUpDto({
    required this.id,
    required this.title,
    required this.dueAt,
    required this.priority,
    required this.status,
    required this.assignedToMembershipId,
    required this.version,
    this.type = FollowUpTypes.call,
    this.notes,
    this.assigneeName,
    this.completedAt,
    this.leadId,
    this.leadNumber,
    this.leadTitle,
    this.overdue = false,
    this.rescheduleCount = 0,
    this.engineBucket,
    this.syncStatus,
    this.updatedAt,
  });

  final String id;
  final String type;
  final String title;
  final String? notes;
  final DateTime dueAt;
  final int priority;
  final String status;
  final String assignedToMembershipId;
  final String? assigneeName;
  final DateTime? completedAt;
  final String? leadId;
  final String? leadNumber;
  final String? leadTitle;
  final bool overdue;
  final int rescheduleCount;
  final String? engineBucket;
  final int version;
  final String? syncStatus;
  final DateTime? updatedAt;

  factory LeadFollowUpDto.fromJson(Map<String, dynamic> json) {
    return LeadFollowUpDto(
      id: json['id'] as String,
      type: json['type'] as String? ?? FollowUpTypes.call,
      title: json['title'] as String? ?? 'Follow-up',
      notes: json['notes'] as String?,
      dueAt: _parseDate(json['dueAt']) ?? DateTime.now().toUtc(),
      priority: json['priority'] as int? ?? 2,
      status: json['status'] as String? ?? 'pending',
      assignedToMembershipId: json['assignedToMembershipId'] as String? ?? '',
      assigneeName: json['assigneeName'] as String?,
      completedAt: _parseDate(json['completedAt']),
      leadId: json['leadId'] as String?,
      leadNumber: json['leadNumber'] as String?,
      leadTitle: json['leadTitle'] as String?,
      overdue: json['overdue'] as bool? ?? false,
      rescheduleCount: json['rescheduleCount'] as int? ?? 0,
      engineBucket: json['engineBucket'] as String?,
      version: json['version'] as int? ?? 1,
      syncStatus: json['syncStatus'] as String?,
      updatedAt: _parseDate(json['updatedAt']),
    );
  }

  LeadFollowUp toDomain() {
    return LeadFollowUp(
      id: id,
      type: type,
      title: title,
      notes: notes,
      dueAt: dueAt,
      priority: priority,
      status: status,
      assignedToMembershipId: assignedToMembershipId,
      assigneeName: assigneeName,
      completedAt: completedAt,
      leadId: leadId,
      leadNumber: leadNumber,
      leadTitle: leadTitle,
      overdue: overdue,
      rescheduleCount: rescheduleCount,
      engineBucket: engineBucket,
      version: version,
      syncStatus: syncStatus,
      updatedAt: updatedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'title': title,
      'notes': notes,
      'dueAt': dueAt.toIso8601String(),
      'priority': priority,
      'status': status,
      'assignedToMembershipId': assignedToMembershipId,
      'assigneeName': assigneeName,
      'completedAt': completedAt?.toIso8601String(),
      'leadId': leadId,
      'leadNumber': leadNumber,
      'leadTitle': leadTitle,
      'overdue': overdue,
      'rescheduleCount': rescheduleCount,
      'engineBucket': engineBucket,
      'version': version,
      'updatedAt': (updatedAt ?? dueAt).toIso8601String(),
      if (syncStatus != null) 'syncStatus': syncStatus,
    };
  }
}

class LeadLookupsDto {
  const LeadLookupsDto({
    required this.qualities,
    required this.sources,
    required this.staff,
  });

  final List<LeadQualityChoice> qualities;
  final List<LeadSourceOption> sources;
  final List<LeadStaffOption> staff;

  factory LeadLookupsDto.fromJson(Map<String, dynamic> json) {
    return LeadLookupsDto(
      qualities: [
        for (final item in json['qualities'] as List? ?? const [])
          if (item is String)
            LeadQualityChoice(code: item, name: item)
          else if (item is Map)
            LeadQualityChoice(
              code: item['code'] as String? ?? '',
              name: item['name'] as String? ?? item['code'] as String? ?? '',
            ),
      ],
      sources: [
        for (final item in json['sources'] as List? ?? const [])
          if (item is Map<String, dynamic>)
            LeadSourceOption(
              id: item['id'] as String,
              code: item['code'] as String? ?? '',
              name: item['name'] as String? ?? '',
            ),
      ],
      staff: [
        for (final item in json['staff'] as List? ?? const [])
          if (item is Map<String, dynamic>)
            LeadStaffOption(
              id: item['id'] as String,
              fullName: item['fullName'] as String? ?? '',
              designation: item['designation'] as String?,
            ),
      ],
    );
  }

  LeadLookups toDomain() {
    return LeadLookups(qualities: qualities, sources: sources, staff: staff);
  }
}
