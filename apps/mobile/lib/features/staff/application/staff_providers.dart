import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/staff_api.dart';

final staffApiProvider = Provider<StaffApi>((ref) {
  return StaffApi(ref.watch(apiClientProvider));
});

Result<T> unwrapApi<T>(Result<ApiSuccess<T>> result) =>
    unwrapEnvelope(result);
