import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../../site_visits/domain/site_visit.dart';
import '../domain/attendance.dart';

class AttendanceApi {
  AttendanceApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<AttendanceToday>>> today() {
    return _client.get(
      '/attendance/today',
      parse: (json) => AttendanceToday.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AttendanceDaysPage>>> days({String? membershipId}) {
    return _client.get(
      '/attendance/days',
      query: {
        if (membershipId != null) 'membershipId': membershipId,
      },
      parse: (json) => AttendanceDaysPage.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AttendanceSession>>> punchIn({
    required GeoPoint location,
    String? notes,
  }) {
    return _client.post(
      '/attendance/punch-in',
      data: {
        'location': location.toJson(),
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => AttendanceSession.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AttendanceSession>>> punchOut({
    required GeoPoint location,
    String? notes,
  }) {
    return _client.post(
      '/attendance/punch-out',
      data: {
        'location': location.toJson(),
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => AttendanceSession.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<AttendanceReport>>> report() {
    return _client.get(
      '/reports/attendance',
      parse: (json) => AttendanceReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
