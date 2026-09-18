import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/warranty.dart';

class WarrantyApi {
  WarrantyApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<WarrantyCatalog>>> catalog() {
    return _client.get(
      '/warranties/catalog',
      parse: (json) => WarrantyCatalog.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<Warranty>>>> list({
    String? cursor,
    String? status,
    String? leadId,
    String? quotationId,
  }) {
    return _client.get(
      '/warranties',
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
        if (leadId != null) 'leadId': leadId,
        if (quotationId != null) 'quotationId': quotationId,
      },
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) Warranty.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<Warranty>>> getById(String id) {
    return _client.get(
      '/warranties/$id',
      parse: (json) => Warranty.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Warranty>>> create({
    required List<Map<String, dynamic>> items,
    required String warrantyStartOn,
    String? leadId,
    String? quotationId,
    String? serialNumber,
    String? purchasedOn,
    String? warrantyEndOn,
    String? coverageNotes,
  }) {
    return _client.post(
      '/warranties',
      data: {
        'items': items,
        'warrantyStartOn': warrantyStartOn,
        if (leadId != null) 'leadId': leadId,
        if (quotationId != null) 'quotationId': quotationId,
        if (serialNumber != null && serialNumber.isNotEmpty) 'serialNumber': serialNumber,
        if (purchasedOn != null) 'purchasedOn': purchasedOn,
        if (warrantyEndOn != null) 'warrantyEndOn': warrantyEndOn,
        if (coverageNotes != null && coverageNotes.isNotEmpty) 'coverageNotes': coverageNotes,
      },
      parse: (json) => Warranty.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Warranty>>> update({
    required String id,
    required int version,
    List<Map<String, dynamic>>? items,
    String? serialNumber,
    String? purchasedOn,
    String? warrantyStartOn,
    String? warrantyEndOn,
    String? coverageNotes,
  }) {
    return _client.patch(
      '/warranties/$id',
      data: {
        'version': version,
        if (items != null) 'items': items,
        if (serialNumber != null) 'serialNumber': serialNumber,
        if (purchasedOn != null) 'purchasedOn': purchasedOn,
        if (warrantyStartOn != null) 'warrantyStartOn': warrantyStartOn,
        if (warrantyEndOn != null) 'warrantyEndOn': warrantyEndOn,
        if (coverageNotes != null) 'coverageNotes': coverageNotes,
      },
      parse: (json) => Warranty.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Warranty>>> changeStatus({
    required String id,
    required String status,
    required int version,
  }) {
    return _client.post(
      '/warranties/$id/status',
      data: {'status': status, 'version': version},
      parse: (json) => Warranty.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<WarrantyQr>>> qr(String id) {
    return _client.get(
      '/warranties/$id/qr',
      parse: (json) => WarrantyQr.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<WarrantyPdf>>> pdf(String id) {
    return _client.get(
      '/warranties/$id/pdf',
      parse: (json) => WarrantyPdf.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<PublicWarranty>>> verifyPublic(String token) {
    return _client.get(
      '/public/warranty/$token',
      parse: (json) => PublicWarranty.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<List<int>>> downloadPublicPdf(String token) {
    return _client.getBytes('/public/warranty/$token/pdf');
  }

  Future<Result<ApiSuccess<WarrantyReport>>> report() {
    return _client.get(
      '/reports/warranties',
      parse: (json) => WarrantyReport.fromJson(json! as Map<String, dynamic>),
    );
  }
}
