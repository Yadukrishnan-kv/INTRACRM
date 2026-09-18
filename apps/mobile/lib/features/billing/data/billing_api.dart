import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/billing_models.dart';

class BillingApi {
  BillingApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<BillingSnapshot>>> snapshot(String leadId) {
    return _client.get(
      '/leads/$leadId/billing',
      parse: (json) => BillingSnapshot.fromJson(json! as Map<String, dynamic>),
    );
  }
}
