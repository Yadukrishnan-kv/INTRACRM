class Lead {
  const Lead({
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

  bool get isPendingSync =>
      syncStatus == 'pending' || leadNumber == 'LOCAL';

  bool get hasConflict => syncStatus == 'conflict';

  String get displayName =>
      (customerName != null && customerName!.trim().isNotEmpty)
      ? customerName!
      : title;

  String get valueLabel {
    final minor = estimatedValueMinor;
    if (minor == null) {
      return '—';
    }
    final rupees = minor / 100;
    return '$currency ${rupees.toStringAsFixed(rupees.truncateToDouble() == rupees ? 0 : 2)}';
  }
}

class LeadActivity {
  const LeadActivity({
    required this.id,
    required this.type,
    required this.occurredAt,
    this.subject,
    this.body,
    this.actorName,
    this.syncStatus,
  });

  final String id;
  final String type;
  final String? subject;
  final String? body;
  final DateTime occurredAt;
  final String? actorName;
  final String? syncStatus;
}

class LeadFollowUp {
  const LeadFollowUp({
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

  bool get isPending => status == 'pending';
  bool get isPendingSync => syncStatus == 'pending';
  bool get hasConflict => syncStatus == 'conflict';
}

class FollowUpTypes {
  static const call = 'call';
  static const whatsapp = 'whatsapp';
  static const visit = 'visit';
  static const meeting = 'meeting';
  static const all = [call, whatsapp, visit, meeting];

  static String title(String code) {
    return switch (code) {
      call => 'Call',
      whatsapp => 'WhatsApp',
      visit => 'Visit',
      meeting => 'Meeting',
      _ => 'Follow-up',
    };
  }
}

class LeadStaffOption {
  const LeadStaffOption({
    required this.id,
    required this.fullName,
    this.designation,
  });

  final String id;
  final String fullName;
  final String? designation;
}

class LeadSourceOption {
  const LeadSourceOption({
    required this.id,
    required this.code,
    required this.name,
  });

  final String id;
  final String code;
  final String name;
}

class LeadQualityChoice {
  const LeadQualityChoice({
    required this.code,
    required this.name,
  });

  final String code;
  final String name;
}

class LeadLookups {
  const LeadLookups({
    required this.qualities,
    required this.sources,
    required this.staff,
  });

  final List<LeadQualityChoice> qualities;
  final List<LeadSourceOption> sources;
  final List<LeadStaffOption> staff;
}

class CreateLeadInput {
  const CreateLeadInput({
    required this.title,
    this.customerName,
    this.primaryPhone,
    this.primaryEmail,
    this.city,
    this.requirement,
    this.sourceId,
    this.quality,
    this.estimatedValueMinor,
    this.ownerMembershipId,
    this.followUpDueAt,
    this.followUpNotes,
    this.followUpType,
  });

  final String title;
  final String? customerName;
  final String? primaryPhone;
  final String? primaryEmail;
  final String? city;
  final String? requirement;
  final String? sourceId;
  final String? quality;
  final int? estimatedValueMinor;
  final String? ownerMembershipId;
  final DateTime? followUpDueAt;
  final String? followUpNotes;
  final String? followUpType;
}
