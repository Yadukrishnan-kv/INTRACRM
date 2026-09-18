import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/catalog_api.dart';

final catalogApiProvider = Provider<CatalogApi>((ref) {
  return CatalogApi(ref.watch(apiClientProvider));
});

Result<T> unwrapCatalog<T>(Result<dynamic> result) {
  return switch (result) {
    Success(:final value) => Success(value.data as T),
    Err(:final failure) => Err(failure),
  };
}
