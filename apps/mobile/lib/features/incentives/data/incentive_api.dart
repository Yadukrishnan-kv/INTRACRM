import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/incentive.dart';

class IncentiveApi {
  IncentiveApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<IncentiveReport>>> report({
    String? planId,
    String? membershipId,
    String? status,
    String? from,
    String? to,
  }) {
    return _client.get(
      '/reports/incentives',
      query: {
        'planId': ?planId,
        'membershipId': ?membershipId,
        'status': ?status,
        'from': ?from,
        'to': ?to,
      },
      parse: (json) => IncentiveReport.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<MyIncentive>>> mine({String? planId, String? periodStart}) {
    return _client.get(
      '/incentives/me',
      query: {'planId': ?planId, 'periodStart': ?periodStart},
      parse: (json) => MyIncentive.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<List<IncentivePlan>>>> listPlans({String? status, String? cursor}) {
    return _client.get(
      '/incentives/plans',
      query: {'limit': 50, 'status': ?status, 'cursor': ?cursor},
      parse: (json) {
        final items = json as List<dynamic>? ?? const [];
        return [
          for (final item in items)
            if (item is Map<String, dynamic>) IncentivePlan.fromJson(item),
        ];
      },
    );
  }

  Future<Result<ApiSuccess<IncentivePlan>>> getPlan(String planId) {
    return _client.get(
      '/incentives/plans/$planId',
      parse: (json) => IncentivePlan.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<IncentivePlan>>> createPlan(Map<String, dynamic> body) {
    return _client.post(
      '/incentives/plans',
      data: body,
      parse: (json) => IncentivePlan.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// Only name, description, status, hold, minimum, cap and end date can
  /// change; metric, period and start date are fixed once a plan exists.
  Future<Result<ApiSuccess<IncentivePlan>>> updatePlan(String planId, Map<String, dynamic> body) {
    return _client.patch(
      '/incentives/plans/$planId',
      data: body,
      parse: (json) => IncentivePlan.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// Refused with 409 once a plan has approved or paid payouts; archive it then.
  Future<Result<ApiSuccess<Object?>>> deletePlan(String planId) {
    return _client.delete('/incentives/plans/$planId', parse: (json) => json);
  }

  Future<Result<ApiSuccess<IncentiveSlab>>> addSlab(String planId, Map<String, dynamic> body) {
    return _client.post(
      '/incentives/plans/$planId/slabs',
      data: body,
      parse: (json) => IncentiveSlab.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<IncentiveSlab>>> updateSlab(
    String planId,
    String slabId,
    Map<String, dynamic> body,
  ) {
    return _client.patch(
      '/incentives/plans/$planId/slabs/$slabId',
      data: body,
      parse: (json) => IncentiveSlab.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<Object?>>> deleteSlab(String planId, String slabId) {
    return _client.delete('/incentives/plans/$planId/slabs/$slabId', parse: (json) => json);
  }

  /// Recomputes a plan over a period. The server leaves approved and paid
  /// payouts untouched and reports how many it skipped.
  Future<Result<ApiSuccess<Map<String, dynamic>>>> compute({
    required String planId,
    String? periodStart,
    String? periodEnd,
  }) {
    return _client.post(
      '/incentives/compute',
      data: {
        'planId': planId,
        'periodStart': ?periodStart,
        'periodEnd': ?periodEnd,
      },
      parse: (json) => json! as Map<String, dynamic>,
    );
  }

  Future<Result<ApiSuccess<IncentivePayout>>> approve(String payoutId, {String? notes}) {
    return _client.post(
      '/incentives/payouts/$payoutId/approve',
      data: {'notes': ?notes},
      parse: (json) => IncentivePayout.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `POST /incentives/payouts/:id/void` (`incentive:manage`); allowed from
  /// draft or approved, 409 for paid/void.
  Future<Result<ApiSuccess<IncentivePayout>>> voidPayout(String payoutId, {String? notes}) {
    return _client.post(
      '/incentives/payouts/$payoutId/void',
      data: {'notes': ?notes},
      parse: (json) => IncentivePayout.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<IncentivePayout>>> markPaid(String payoutId, {String? notes}) {
    return _client.post(
      '/incentives/payouts/$payoutId/pay',
      data: {'notes': ?notes},
      parse: (json) => IncentivePayout.fromJson(json! as Map<String, dynamic>),
    );
  }
}
