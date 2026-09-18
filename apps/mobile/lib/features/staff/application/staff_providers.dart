import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/staff_api.dart';

final staffApiProvider = Provider<StaffApi>((ref) {
  return StaffApi(ref.watch(apiClientProvider));
});

Result<T> unwrapApi<T>(Result<dynamic> result) {
  return switch (result) {
    Success(:final value) => Success(value.data as T),
    Err(:final failure) => Err(failure),
  };
}
