import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/search_hit.dart';

class SearchApi {
  SearchApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<SearchPageData>>> search({
    required String q,
    String? by,
  }) {
    return _client.get(
      '/search',
      query: {
        'q': q,
        'limit': 20,
        if (by != null) 'by': by,
      },
      parse: (json) {
        final map = json! as Map<String, dynamic>;
        final items = map['hits'] as List<dynamic>? ?? const [];
        return SearchPageData(
          hits: [
            for (final item in items)
              if (item is Map<String, dynamic>) SearchHit.fromJson(item),
          ],
          classifiedAs: map['classifiedAs'] as String?,
          strategy: map['strategy'] as String?,
        );
      },
    );
  }
}
