import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../leads/data/lead_dto.dart';
import '../../leads/domain/lead.dart';
import '../domain/follow_up_dashboard.dart';
import '../domain/follow_up_report.dart';

class FollowUpApi {
  FollowUpApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<LeadFollowUp>>>> list({
    String? cursor,
    String? status,
    String? type,
    String? leadId,
    bool? overdue,
    String? bucket,
  }) {
    return _client.get(
      '/follow-ups',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
        if (type != null) 'type': type,
        if (leadId != null) 'leadId': leadId,
        if (overdue == true) 'overdue': true,
        if (bucket != null) 'bucket': bucket,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) LeadFollowUpDto.fromJson(item).toDomain(),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> getById(String id) {
    return _client.get(
      '/follow-ups/$id',
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> create({
    required String leadId,
    required String type,
    required DateTime dueAt,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  }) {
    return _client.post(
      '/follow-ups',
      data: {
        'leadId': leadId,
        'type': type,
        'dueAt': dueAt.toUtc().toIso8601String(),
        if (title != null && title.isNotEmpty) 'title': title,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (priority != null) 'priority': priority,
        if (assignedToMembershipId != null) 'assignedToMembershipId': assignedToMembershipId,
      },
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> update({
    required String id,
    required int version,
    String? type,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  }) {
    return _client.patch(
      '/follow-ups/$id',
      data: {
        'version': version,
        if (type != null) 'type': type,
        if (title != null && title.isNotEmpty) 'title': title,
        'notes': notes,
        if (priority != null) 'priority': priority,
        if (assignedToMembershipId != null) 'assignedToMembershipId': assignedToMembershipId,
      },
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> reschedule({
    required String id,
    required DateTime dueAt,
    required int version,
    String? reason,
  }) {
    return _client.post(
      '/follow-ups/$id/reschedule',
      data: {
        'dueAt': dueAt.toUtc().toIso8601String(),
        'version': version,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> complete({
    required String id,
    required int version,
    String? notes,
  }) {
    return _client.post(
      '/follow-ups/$id/complete',
      data: {
        'version': version,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<FollowUpDashboard>>> dashboard() {
    return _client.get(
      '/follow-ups/engine/dashboard',
      parse: (json) => FollowUpDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<FollowUpGap>>>> gaps() {
    return _client.get(
      '/follow-ups/engine/gaps',
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) FollowUpGap.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<FollowUpReport>>> report() {
    return _client.get(
      '/reports/follow-ups',
      parse: (json) => FollowUpReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
