import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/billing_api.dart';

final billingApiProvider = Provider<BillingApi>((ref) {
  return BillingApi(ref.watch(apiClientProvider));
});

Result<T> unwrapBilling<T>(Result<dynamic> result) {
  return switch (result) {
    Success(:final value) => Success(value.data as T),
    Err(:final failure) => Err(failure),
  };
}
