import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/catalog_models.dart';

class CatalogApi {
  CatalogApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<CatalogKindInfo>>>> overview() {
    return _client.get(
      '/catalog',
      parse: (json) {
        final map = json is Map<String, dynamic> ? json : const <String, dynamic>{};
        return _maps(map['kinds']).map(CatalogKindInfo.fromJson).toList();
      },
    );
  }

  Future<Result<ApiSuccess<CatalogLookups>>> lookups() {
    return _client.get(
      '/catalog/lookups',
      parse: (json) => CatalogLookups.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<CatalogItem>>>> list(String kind) {
    return _client.get(
      CatalogKinds.path(kind),
      query: const {'includeInactive': true},
      parse: (json) => _maps(json).map(CatalogItem.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<CatalogItem>>> create(String kind, Map<String, dynamic> data) {
    return _client.post(
      CatalogKinds.path(kind),
      data: data,
      parse: (json) => CatalogItem.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<CatalogItem>>> update(
    String kind,
    String id,
    Map<String, dynamic> data,
  ) {
    return _client.patch(
      '${CatalogKinds.path(kind)}/$id',
      data: data,
      parse: (json) => CatalogItem.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<bool>>> delete(String kind, String id) {
    return _client.delete(
      '${CatalogKinds.path(kind)}/$id',
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<List<CatalogItem>>>> saveTaxes({
    required List<Map<String, dynamic>> items,
    List<String> deleteIds = const [],
  }) {
    return _client.post(
      '/catalog/taxes/batch',
      data: {
        'items': items,
        if (deleteIds.isNotEmpty) 'deleteIds': deleteIds,
      },
      parse: (json) => _maps(json).map(CatalogItem.fromJson).toList(),
    );
  }

  List<Map<String, dynamic>> _maps(Object? json) {
    if (json is! List) {
      return const [];
    }
    return json
        .whereType<Map<dynamic, dynamic>>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
