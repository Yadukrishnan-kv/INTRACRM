import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/site_visit.dart';

class SiteVisitApi {
  SiteVisitApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<SiteVisit>>>> list({
    String? cursor,
    String? status,
    String? leadId,
    bool? overdue,
  }) {
    return _client.get(
      '/site-visits',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
        if (leadId != null) 'leadId': leadId,
        if (overdue == true) 'overdue': true,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) SiteVisit.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<List<SiteVisit>>>> listForLead(String leadId) {
    return _client.get(
      '/leads/$leadId/site-visits',
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) SiteVisit.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> getById(String id) {
    return _client.get(
      '/site-visits/$id',
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> create({
    required String leadId,
    required DateTime scheduledAt,
    String? purpose,
    String? notes,
    String? addressLine1,
    String? city,
    String? state,
    String? postalCode,
    String? assignedToMembershipId,
    GeoPoint? scheduledLocation,
  }) {
    return _client.post(
      '/site-visits',
      data: {
        'leadId': leadId,
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (purpose != null && purpose.isNotEmpty) 'purpose': purpose,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (addressLine1 != null && addressLine1.isNotEmpty) 'addressLine1': addressLine1,
        if (city != null && city.isNotEmpty) 'city': city,
        if (state != null && state.isNotEmpty) 'state': state,
        if (postalCode != null && postalCode.isNotEmpty) 'postalCode': postalCode,
        if (assignedToMembershipId != null) 'assignedToMembershipId': assignedToMembershipId,
        if (scheduledLocation != null) 'scheduledLocation': scheduledLocation.toJson(),
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> checkIn({
    required String id,
    required GeoPoint location,
    required int version,
    String? notes,
  }) {
    return _client.post(
      '/site-visits/$id/check-in',
      data: {
        'location': location.toJson(),
        'version': version,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> checkOut({
    required String id,
    required GeoPoint location,
    required int version,
    String? notes,
  }) {
    return _client.post(
      '/site-visits/$id/check-out',
      data: {
        'location': location.toJson(),
        'version': version,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> saveNotes({
    required String id,
    required String notes,
    required int version,
  }) {
    return _client.post(
      '/site-visits/$id/notes',
      data: {'notes': notes, 'version': version},
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> saveFeedback({
    required String id,
    required int version,
    String? customerFeedback,
    int? customerRating,
  }) {
    return _client.post(
      '/site-visits/$id/feedback',
      data: {
        'version': version,
        if (customerFeedback != null) 'customerFeedback': customerFeedback,
        if (customerRating != null) 'customerRating': customerRating,
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> complete({
    required String id,
    required int version,
    String? outcome,
    String? notes,
    String? customerFeedback,
    int? customerRating,
    GeoPoint? location,
  }) {
    return _client.post(
      '/site-visits/$id/complete',
      data: {
        'version': version,
        if (outcome != null && outcome.isNotEmpty) 'outcome': outcome,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (customerFeedback != null) 'customerFeedback': customerFeedback,
        if (customerRating != null) 'customerRating': customerRating,
        if (location != null) 'location': location.toJson(),
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> cancel({
    required String id,
    required int version,
    String? reason,
  }) {
    return _client.post(
      '/site-visits/$id/cancel',
      data: {
        'version': version,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> addPhoto({
    required String id,
    required String contentType,
    required String contentBase64,
    String? caption,
    String? fileName,
    GeoPoint? location,
  }) {
    return _client.post(
      '/site-visits/$id/photos',
      data: {
        'contentType': contentType,
        'contentBase64': contentBase64,
        if (caption != null && caption.isNotEmpty) 'caption': caption,
        if (fileName != null && fileName.isNotEmpty) 'fileName': fileName,
        if (location != null) 'location': location.toJson(),
      },
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisitPhotoContent>>> photoContent({
    required String visitId,
    required String photoId,
  }) {
    return _client.get(
      '/site-visits/$visitId/photos/$photoId',
      parse: (json) => SiteVisitPhotoContent.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisit>>> removePhoto({
    required String visitId,
    required String photoId,
  }) {
    return _client.delete(
      '/site-visits/$visitId/photos/$photoId',
      parse: (json) => SiteVisit.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SiteVisitReport>>> report() {
    return _client.get(
      '/reports/site-visits',
      parse: (json) => SiteVisitReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}

class SiteVisitPhotoContent {
  const SiteVisitPhotoContent({
    required this.id,
    required this.contentType,
    required this.contentBase64,
    this.fileName,
  });

  final String id;
  final String contentType;
  final String contentBase64;
  final String? fileName;

  factory SiteVisitPhotoContent.fromJson(Map<String, dynamic> json) {
    return SiteVisitPhotoContent(
      id: json['id'] as String? ?? '',
      contentType: json['contentType'] as String? ?? 'image/jpeg',
      contentBase64: json['contentBase64'] as String? ?? '',
      fileName: json['fileName'] as String?,
    );
  }
}
