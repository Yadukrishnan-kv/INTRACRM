import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/lead.dart';
import '../domain/lead_report.dart';
import 'lead_dto.dart';

class LeadApi {
  LeadApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<LeadDto>>>> list({String? cursor}) {
    return _client.get(
      '/leads',
      query: {if (cursor != null) 'cursor': cursor, 'limit': 20},
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
      data: _leadBody(input),
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
        ..._leadBody(input, includeFollowUp: false),
        if (version != null) 'version': version,
      },
      parse: (json) => LeadDto.fromJson(json! as Map<String, dynamic>),
    );
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

  Future<Result<ApiSuccess<LeadReport>>> report() {
    return _client.get(
      '/reports/leads',
      parse: (json) => LeadReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> _leadBody(
    CreateLeadInput input, {
    bool includeFollowUp = true,
  }) {
    return {
      'title': input.title,
      if (input.customerName != null && input.customerName!.isNotEmpty)
        'customerName': input.customerName,
      if (input.primaryPhone != null && input.primaryPhone!.isNotEmpty)
        'primaryPhone': input.primaryPhone,
      if (input.primaryEmail != null && input.primaryEmail!.isNotEmpty)
        'primaryEmail': input.primaryEmail,
      if (input.city != null && input.city!.isNotEmpty) 'city': input.city,
      if (input.requirement != null && input.requirement!.isNotEmpty)
        'requirement': input.requirement,
      if (input.sourceId != null) 'sourceId': input.sourceId,
      if (input.quality != null) 'quality': input.quality,
      if (input.estimatedValueMinor != null)
        'estimatedValueMinor': input.estimatedValueMinor,
      if (input.ownerMembershipId != null)
        'ownerMembershipId': input.ownerMembershipId,
      if (includeFollowUp && input.followUpDueAt != null)
        'followUp': {
          'dueAt': input.followUpDueAt!.toUtc().toIso8601String(),
          'type': input.followUpType ?? FollowUpTypes.call,
          if (input.followUpNotes != null && input.followUpNotes!.isNotEmpty)
            'notes': input.followUpNotes,
        },
    };
  }
}
