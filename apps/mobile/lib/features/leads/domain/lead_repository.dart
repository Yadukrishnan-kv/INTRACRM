import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import 'lead.dart';

abstract class LeadRepository {
  Future<Result<PagedData<Lead>>> list({String? cursor});

  Future<Result<Lead>> getById(String id);

  Future<Result<LeadLookups>> lookups();

  Future<Result<Lead>> create(CreateLeadInput input);

  Future<Result<Lead>> update({
    required String id,
    required CreateLeadInput input,
    int? version,
  });

  Future<Result<Lead>> assign({
    required String id,
    required String ownerMembershipId,
    String? reason,
  });

  Future<Result<LeadActivity>> addActivity({
    required String leadId,
    required String type,
    String? subject,
    String? body,
  });

  Future<Result<LeadFollowUp>> addFollowUp({
    required String leadId,
    required DateTime dueAt,
    String? type,
    String? title,
    String? notes,
  });

  Future<Result<LeadFollowUp>> completeFollowUp({
    required String leadId,
    required String followUpId,
    String? notes,
  });
}
