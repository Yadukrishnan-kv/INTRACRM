import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../leads/data/lead_dto.dart';
import '../../leads/domain/lead.dart';
import '../../reports/domain/report_date_range.dart';
import '../domain/follow_up_calendar.dart';
import '../domain/follow_up_dashboard.dart';
import '../domain/follow_up_report.dart';

class FollowUpApi {
  FollowUpApi(this._client);

  final ApiClient _client;

  /// Per-day counts for the calendar grid. [month] is `YYYY-MM`; omitting it
  /// asks the server for the current month in the tenant zone.
  Future<Result<ApiSuccess<FollowUpCalendarMonth>>> calendar({
    String? month,
    String? assignedToMembershipId,
    String? type,
  }) {
    return _client.get(
      '/follow-ups/calendar',
      query: {
        'month': ?month,
        'assignedToMembershipId': ?assignedToMembershipId,
        'type': ?type,
      },
      parse: (json) => FollowUpCalendarMonth.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<LeadFollowUp>>>> list({
    String? cursor,
    String? status,
    String? type,
    String? leadId,
    bool? overdue,
    String? bucket,
    String? dueOn,
    String? assignedToMembershipId,
    int limit = 20,
  }) {
    return _client.get(
      '/follow-ups',
      query: {
        'limit': limit,
        'cursor': ?cursor,
        'status': ?status,
        'type': ?type,
        'leadId': ?leadId,
        if (overdue == true) 'overdue': true,
        'bucket': ?bucket,
        'dueOn': ?dueOn,
        'assignedToMembershipId': ?assignedToMembershipId,
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
        'priority': ?priority,
        'assignedToMembershipId': ?assignedToMembershipId,
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
        'type': ?type,
        if (title != null && title.isNotEmpty) 'title': title,
        'notes': notes,
        'priority': ?priority,
        'assignedToMembershipId': ?assignedToMembershipId,
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

  /// `POST /follow-ups/:id/cancel` (`follow_up:update`); 409 unless pending.
  Future<Result<ApiSuccess<LeadFollowUp>>> cancel({
    required String id,
    required int version,
    String? reason,
  }) {
    return _client.post(
      '/follow-ups/$id/cancel',
      data: {
        'version': version,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
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

  Future<Result<ApiSuccess<FollowUpReport>>> report({ReportDateRange? range}) {
    return _client.get(
      '/reports/follow-ups',
      query: reportRangeQuery(range, ReportDateMode.instant),
      parse: (json) => FollowUpReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
