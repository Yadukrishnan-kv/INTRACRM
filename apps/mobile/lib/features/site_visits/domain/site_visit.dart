class GeoPoint {
  const GeoPoint({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;

  factory GeoPoint.fromJson(Map<String, dynamic> json) {
    return GeoPoint(
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      accuracyMeters: (json['accuracyMeters'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      if (accuracyMeters != null) 'accuracyMeters': accuracyMeters,
    };
  }

  String get label => '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}';
}

class SiteVisitPhoto {
  const SiteVisitPhoto({
    required this.id,
    required this.contentType,
    required this.byteSize,
    required this.capturedAt,
    this.caption,
    this.location,
    this.sortOrder = 0,
  });

  final String id;
  final String? caption;
  final String contentType;
  final int byteSize;
  final DateTime capturedAt;
  final GeoPoint? location;
  final int sortOrder;

  factory SiteVisitPhoto.fromJson(Map<String, dynamic> json) {
    final location = json['location'];
    return SiteVisitPhoto(
      id: json['id'] as String? ?? '',
      caption: json['caption'] as String?,
      contentType: json['contentType'] as String? ?? 'image/jpeg',
      byteSize: json['byteSize'] as int? ?? 0,
      capturedAt:
          DateTime.tryParse(json['capturedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      location: location is Map<String, dynamic> ? GeoPoint.fromJson(location) : null,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}

class SiteVisit {
  const SiteVisit({
    required this.id,
    required this.status,
    required this.scheduledAt,
    required this.assignedToMembershipId,
    required this.leadId,
    required this.version,
    this.purpose,
    this.notes,
    this.outcome,
    this.checkedInAt,
    this.checkedOutAt,
    this.addressLine1,
    this.city,
    this.state,
    this.postalCode,
    this.scheduledLocation,
    this.checkInLocation,
    this.checkOutLocation,
    this.customerFeedback,
    this.customerRating,
    this.feedbackCapturedAt,
    this.photoCount = 0,
    this.photos = const [],
    this.assigneeName,
    this.leadNumber,
    this.leadTitle,
    this.customerName,
  });

  final String id;
  final String status;
  final String? purpose;
  final String? notes;
  final String? outcome;
  final DateTime scheduledAt;
  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;
  final String? addressLine1;
  final String? city;
  final String? state;
  final String? postalCode;
  final GeoPoint? scheduledLocation;
  final GeoPoint? checkInLocation;
  final GeoPoint? checkOutLocation;
  final String? customerFeedback;
  final int? customerRating;
  final DateTime? feedbackCapturedAt;
  final int photoCount;
  final List<SiteVisitPhoto> photos;
  final String assignedToMembershipId;
  final String? assigneeName;
  final String leadId;
  final String? leadNumber;
  final String? leadTitle;
  final String? customerName;
  final int version;

  bool get isScheduled => status == 'scheduled';
  bool get isInProgress => status == 'in_progress';
  bool get isOpen => isScheduled || isInProgress;
  bool get isCompleted => status == 'completed';

  String get title =>
      purpose?.trim().isNotEmpty == true ? purpose! : (leadTitle ?? customerName ?? 'Site visit');

  factory SiteVisit.fromJson(Map<String, dynamic> json) {
    final photos = json['photos'] as List<dynamic>? ?? const [];
    return SiteVisit(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'scheduled',
      purpose: json['purpose'] as String?,
      notes: json['notes'] as String?,
      outcome: json['outcome'] as String?,
      scheduledAt:
          DateTime.tryParse(json['scheduledAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      checkedInAt: DateTime.tryParse(json['checkedInAt'] as String? ?? ''),
      checkedOutAt: DateTime.tryParse(json['checkedOutAt'] as String? ?? ''),
      addressLine1: json['addressLine1'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
      postalCode: json['postalCode'] as String?,
      scheduledLocation: _geo(json['scheduledLocation']),
      checkInLocation: _geo(json['checkInLocation']),
      checkOutLocation: _geo(json['checkOutLocation']),
      customerFeedback: json['customerFeedback'] as String?,
      customerRating: json['customerRating'] as int?,
      feedbackCapturedAt: DateTime.tryParse(json['feedbackCapturedAt'] as String? ?? ''),
      photoCount: json['photoCount'] as int? ?? 0,
      photos: [
        for (final item in photos)
          if (item is Map<String, dynamic>) SiteVisitPhoto.fromJson(item),
      ],
      assignedToMembershipId: json['assignedToMembershipId'] as String? ?? '',
      assigneeName: json['assigneeName'] as String?,
      leadId: json['leadId'] as String? ?? '',
      leadNumber: json['leadNumber'] as String?,
      leadTitle: json['leadTitle'] as String?,
      customerName: json['customerName'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }

  static GeoPoint? _geo(Object? json) {
    if (json is Map<String, dynamic>) {
      return GeoPoint.fromJson(json);
    }
    return null;
  }
}

class SiteVisitReport {
  const SiteVisitReport({
    required this.generatedAt,
    required this.totals,
    this.byStatus = const [],
    this.byAssignee = const [],
  });

  final DateTime generatedAt;
  final SiteVisitReportTotals totals;
  final List<SiteVisitStatusCount> byStatus;
  final List<SiteVisitAssigneeRow> byAssignee;

  factory SiteVisitReport.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    final byStatus = json['byStatus'] as List<dynamic>? ?? const [];
    final byAssignee = json['byAssignee'] as List<dynamic>? ?? const [];
    return SiteVisitReport(
      generatedAt:
          DateTime.tryParse(json['generatedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      totals: SiteVisitReportTotals.fromJson(totals),
      byStatus: [
        for (final item in byStatus)
          if (item is Map<String, dynamic>) SiteVisitStatusCount.fromJson(item),
      ],
      byAssignee: [
        for (final item in byAssignee)
          if (item is Map<String, dynamic>) SiteVisitAssigneeRow.fromJson(item),
      ],
    );
  }
}

class SiteVisitReportTotals {
  const SiteVisitReportTotals({
    required this.total,
    required this.scheduled,
    required this.inProgress,
    required this.completed,
    required this.cancelled,
    required this.noShow,
    required this.withGps,
    required this.withPhotos,
    required this.withFeedback,
    this.averageRating,
  });

  final int total;
  final int scheduled;
  final int inProgress;
  final int completed;
  final int cancelled;
  final int noShow;
  final int withGps;
  final int withPhotos;
  final int withFeedback;
  final double? averageRating;

  factory SiteVisitReportTotals.fromJson(Map<String, dynamic> json) {
    return SiteVisitReportTotals(
      total: json['total'] as int? ?? 0,
      scheduled: json['scheduled'] as int? ?? 0,
      inProgress: json['inProgress'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      cancelled: json['cancelled'] as int? ?? 0,
      noShow: json['noShow'] as int? ?? 0,
      withGps: json['withGps'] as int? ?? 0,
      withPhotos: json['withPhotos'] as int? ?? 0,
      withFeedback: json['withFeedback'] as int? ?? 0,
      averageRating: (json['averageRating'] as num?)?.toDouble(),
    );
  }
}

class SiteVisitStatusCount {
  const SiteVisitStatusCount({required this.status, required this.count});

  final String status;
  final int count;

  factory SiteVisitStatusCount.fromJson(Map<String, dynamic> json) {
    return SiteVisitStatusCount(
      status: json['status'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }
}

class SiteVisitAssigneeRow {
  const SiteVisitAssigneeRow({
    required this.membershipId,
    required this.total,
    required this.completed,
    required this.noShow,
    required this.withGps,
    this.name,
    this.averageRating,
  });

  final String membershipId;
  final String? name;
  final int total;
  final int completed;
  final int noShow;
  final int withGps;
  final double? averageRating;

  factory SiteVisitAssigneeRow.fromJson(Map<String, dynamic> json) {
    return SiteVisitAssigneeRow(
      membershipId: json['membershipId'] as String? ?? '',
      name: json['name'] as String?,
      total: json['total'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      noShow: json['noShow'] as int? ?? 0,
      withGps: json['withGps'] as int? ?? 0,
      averageRating: (json['averageRating'] as num?)?.toDouble(),
    );
  }
}

class SiteVisitStatuses {
  static const scheduled = 'scheduled';
  static const inProgress = 'in_progress';
  static const completed = 'completed';
  static const cancelled = 'cancelled';
  static const noShow = 'no_show';
  static const all = [scheduled, inProgress, completed, cancelled, noShow];

  static String title(String code) {
    return switch (code) {
      scheduled => 'Scheduled',
      inProgress => 'In progress',
      completed => 'Completed',
      cancelled => 'Cancelled',
      noShow => 'No show',
      _ => code,
    };
  }
}
