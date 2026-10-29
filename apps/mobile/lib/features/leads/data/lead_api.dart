import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../reports/domain/report_date_range.dart';
import '../domain/lead.dart';
import '../domain/lead_report.dart';
import 'lead_dto.dart';

class LeadApi {
  LeadApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<LeadDto>>>> list({String? cursor}) {
    return _client.get(
      '/leads',
      query: {'cursor': ?cursor, 'limit': 20},
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) LeadDto.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<LeadDto>>> getById(String id) {
    return _client.get(
      '/leads/$id',
      parse: (json) => LeadDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<LeadLookupsDto>>> lookups() {
    return _client.get(
      '/leads/lookups',
      parse: (json) => LeadLookupsDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<LeadDto>>> create(CreateLeadInput input) {
    return _client.post(
      '/leads',
      data: createBody(input),
      parse: (json) => LeadDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<LeadDto>>> update({
    required String id,
    required CreateLeadInput input,
    int? version,
  }) {
    return _client.patch(
      '/leads/$id',
      data: {
        ...updateBody(input),
        'version': ?version,
      },
      parse: (json) => LeadDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Object?>>> deleteLead(String id) {
    return _client.delete('/leads/$id', parse: (json) => json);
  }

  Future<Result<ApiSuccess<LeadDto>>> assign({
    required String id,
    required String ownerMembershipId,
    String? reason,
  }) {
    return _client.post(
      '/leads/$id/assign',
      data: {
        'ownerMembershipId': ownerMembershipId,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      parse: (json) => LeadDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<LeadActivity>>> addActivity({
    required String leadId,
    required String type,
    String? subject,
    String? body,
  }) {
    return _client.post(
      '/leads/$leadId/activities',
      data: {
        'type': type,
        if (subject != null && subject.isNotEmpty) 'subject': subject,
        if (body != null && body.isNotEmpty) 'body': body,
      },
      parse: (json) =>
          LeadActivityDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> addFollowUp({
    required String leadId,
    required DateTime dueAt,
    String? type,
    String? title,
    String? notes,
  }) {
    return _client.post(
      '/leads/$leadId/follow-ups',
      data: {
        'dueAt': dueAt.toUtc().toIso8601String(),
        'type': type ?? FollowUpTypes.call,
        if (title != null && title.isNotEmpty) 'title': title,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadFollowUp>>> completeFollowUp({
    required String leadId,
    required String followUpId,
    String? notes,
  }) {
    return _client.post(
      '/leads/$leadId/follow-ups/$followUpId/complete',
      data: {if (notes != null && notes.isNotEmpty) 'notes': notes},
      parse: (json) =>
          LeadFollowUpDto.fromJson(json! as Map<String, dynamic>).toDomain(),
    );
  }

  Future<Result<ApiSuccess<LeadReport>>> report({ReportDateRange? range}) {
    return _client.get(
      '/reports/leads',
      query: reportRangeQuery(range, ReportDateMode.instant),
      parse: (json) => LeadReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// PATCH body for a lead edit. Cleared fields go out as null so the server
  /// clears them; omitting them would keep the old value.
  static Map<String, dynamic> updateBody(CreateLeadInput input) {
    return {
      'title': input.title,
      'customerName': _blankToNull(input.customerName),
      'primaryPhone': _blankToNull(input.primaryPhone),
      'primaryEmail': _blankToNull(input.primaryEmail),
      'city': _blankToNull(input.city),
      'requirement': _blankToNull(input.requirement),
      'sourceId': input.sourceId,
      'quality': input.quality,
      'estimatedValueMinor': input.estimatedValueMinor,
      // Unassigning is not an edit; ownership changes go through /assign.
      'ownerMembershipId': ?input.ownerMembershipId,
    };
  }

  /// POST body for a new lead. Blank fields are left out, since an empty
  /// string fails validation (e.g. the email check).
  static Map<String, dynamic> createBody(
    CreateLeadInput input, {
    bool includeFollowUp = true,
  }) {
    return {
      'title': input.title,
      'customerName': ?_blankToNull(input.customerName),
      'primaryPhone': ?_blankToNull(input.primaryPhone),
      'primaryEmail': ?_blankToNull(input.primaryEmail),
      'city': ?_blankToNull(input.city),
      'requirement': ?_blankToNull(input.requirement),
      'sourceId': ?input.sourceId,
      'quality': ?input.quality,
      'estimatedValueMinor': ?input.estimatedValueMinor,
      'ownerMembershipId': ?input.ownerMembershipId,
      if (includeFollowUp && input.followUpDueAt != null)
        'followUp': {
          'dueAt': input.followUpDueAt!.toUtc().toIso8601String(),
          'type': input.followUpType ?? FollowUpTypes.call,
          if (input.followUpNotes != null && input.followUpNotes!.isNotEmpty)
            'notes': input.followUpNotes,
        },
    };
  }

  static String? _blankToNull(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}
