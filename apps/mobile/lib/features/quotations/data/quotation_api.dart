import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/quotation.dart';
import '../domain/sales_report.dart';

class QuotationApi {
  QuotationApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<QuotationCatalog>>> catalog() {
    return _client.get(
      '/quotations/catalog',
      parse: (json) => QuotationCatalog.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<Quotation>>>> list({
    String? cursor,
    String? status,
    String? leadId,
    bool? pending,
    String? bucket,
  }) {
    return _client.get(
      '/quotations',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
        if (leadId != null) 'leadId': leadId,
        if (pending == true) 'pending': true,
        if (bucket != null) 'bucket': bucket,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) Quotation.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<Quotation>>> getById(String id) {
    return _client.get(
      '/quotations/$id',
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Quotation>>> create({
    required String leadId,
    required List<Map<String, dynamic>> items,
    String? title,
    String? notes,
    String? terms,
    String? validUntilOn,
    String? expectedCloseOn,
  }) {
    return _client.post(
      '/quotations',
      data: {
        'leadId': leadId,
        'items': items,
        if (title != null && title.isNotEmpty) 'title': title,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (terms != null && terms.isNotEmpty) 'terms': terms,
        if (validUntilOn != null) 'validUntilOn': validUntilOn,
        if (expectedCloseOn != null) 'expectedCloseOn': expectedCloseOn,
      },
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Quotation>>> update({
    required String id,
    required int version,
    required List<Map<String, dynamic>> items,
    String? title,
    String? notes,
    String? terms,
    String? validUntilOn,
    String? expectedCloseOn,
  }) {
    return _client.patch(
      '/quotations/$id',
      data: {
        'version': version,
        'items': items,
        if (title != null) 'title': title,
        if (notes != null) 'notes': notes,
        if (terms != null) 'terms': terms,
        if (validUntilOn != null) 'validUntilOn': validUntilOn,
        if (expectedCloseOn != null) 'expectedCloseOn': expectedCloseOn,
      },
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<bool>>> remove(String id) {
    return _client.delete(
      '/quotations/$id',
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<Quotation>>> send({
    required String id,
    required int version,
  }) {
    return _client.post(
      '/quotations/$id/send',
      data: {'version': version},
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Quotation>>> changeStatus({
    required String id,
    required String status,
    required int version,
    String? reason,
  }) {
    return _client.post(
      '/quotations/$id/status',
      data: {
        'status': status,
        'version': version,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Quotation>>> scheduleFollowUp({
    required String id,
    required int version,
    DateTime? nextFollowUpAt,
    DateTime? remindAt,
    String? expectedCloseOn,
    String? note,
    bool logged = false,
  }) {
    return _client.post(
      '/quotations/$id/follow-up',
      data: {
        'version': version,
        if (nextFollowUpAt != null) 'nextFollowUpAt': nextFollowUpAt.toUtc().toIso8601String(),
        if (remindAt != null) 'remindAt': remindAt.toUtc().toIso8601String(),
        if (expectedCloseOn != null) 'expectedCloseOn': expectedCloseOn,
        if (note != null && note.isNotEmpty) 'note': note,
        if (logged) 'logged': true,
      },
      parse: (json) => Quotation.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<QuotationFollowUpDashboard>>> dashboard() {
    return _client.get(
      '/quotations/engine/dashboard',
      parse: (json) => QuotationFollowUpDashboard.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<QuotationReport>>> report() {
    return _client.get(
      '/reports/quotations',
      parse: (json) => QuotationReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<SalesReport>>> salesReport() {
    return _client.get(
      '/reports/sales',
      parse: (json) => SalesReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
