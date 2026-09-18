import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../leads/domain/lead.dart';

abstract class FollowUpRepository {
  Future<Result<PagedData<LeadFollowUp>>> list({
    String? cursor,
    String? status,
    String? type,
    String? leadId,
    bool? overdue,
  });

  Future<Result<LeadFollowUp>> getById(String id);

  Future<Result<LeadFollowUp>> create({
    required String leadId,
    required String type,
    required DateTime dueAt,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  });

  Future<Result<LeadFollowUp>> update({
    required String id,
    required int version,
    String? type,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  });

  Future<Result<LeadFollowUp>> complete({
    required String id,
    required int version,
    String? notes,
  });

  Future<Result<LeadFollowUp>> reschedule({
    required String id,
    required DateTime dueAt,
    required int version,
    String? reason,
  });
}
