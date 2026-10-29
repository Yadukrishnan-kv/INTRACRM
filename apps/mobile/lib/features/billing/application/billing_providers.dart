import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/billing_api.dart';

final billingApiProvider = Provider<BillingApi>((ref) {
  return BillingApi(ref.watch(apiClientProvider));
});

Result<T> unwrapBilling<T>(Result<ApiSuccess<T>> result) =>
    unwrapEnvelope(result);
