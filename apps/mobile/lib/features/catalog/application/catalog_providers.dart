import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/catalog_api.dart';

final catalogApiProvider = Provider<CatalogApi>((ref) {
  return CatalogApi(ref.watch(apiClientProvider));
});

Result<T> unwrapCatalog<T>(Result<ApiSuccess<T>> result) =>
    unwrapEnvelope(result);
