import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../reports/domain/report_date_range.dart';
import '../data/incentive_api.dart';
import '../domain/incentive.dart';

final incentiveApiProvider = Provider<IncentiveApi>((ref) {
  return IncentiveApi(ref.watch(apiClientProvider));
});

/// Which slice of the payout history the report is showing. Null means every
/// plan, everyone and every period the tenant has computed.
class IncentiveReportFilter {
  const IncentiveReportFilter({this.planId, this.membershipId, this.status, this.range});

  final String? planId;
  final String? membershipId;
  final String? status;

  /// Period overlap filter; `/reports/incentives` reads from/to as inclusive
  /// YYYY-MM-DD dates.
  final ReportDateRange? range;

  IncentiveReportFilter copyWith({
    Object? planId = _unset,
    Object? membershipId = _unset,
    Object? status = _unset,
    Object? range = _unset,
  }) {
    return IncentiveReportFilter(
      planId: planId == _unset ? this.planId : planId as String?,
      membershipId: membershipId == _unset ? this.membershipId : membershipId as String?,
      status: status == _unset ? this.status : status as String?,
      range: range == _unset ? this.range : range as ReportDateRange?,
    );
  }

  static const _unset = Object();
}

final incentiveReportFilterProvider = StateProvider<IncentiveReportFilter>((ref) {
  return const IncentiveReportFilter();
});

final incentiveReportProvider =
    AsyncNotifierProvider<IncentiveReportController, Result<IncentiveReport>>(
      IncentiveReportController.new,
    );

class IncentiveReportController extends AsyncNotifier<Result<IncentiveReport>> {
  @override
  Future<Result<IncentiveReport>> build() {
    final filter = ref.watch(incentiveReportFilterProvider);
    return _load(filter);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load(ref.read(incentiveReportFilterProvider)));
  }

  Future<Result<IncentiveReport>> _load(IncentiveReportFilter filter) async {
    final range = reportRangeQuery(filter.range, ReportDateMode.ymd);
    final result = await ref.read(incentiveApiProvider).report(
          planId: filter.planId,
          membershipId: filter.membershipId,
          status: filter.status,
          from: range['from'],
          to: range['to'],
        );
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

/// Plans, for the report's plan filter and the plan list page.
final incentivePlansProvider =
    AsyncNotifierProvider<IncentivePlansController, Result<List<IncentivePlan>>>(
      IncentivePlansController.new,
    );

class IncentivePlansController extends AsyncNotifier<Result<List<IncentivePlan>>> {
  @override
  Future<Result<List<IncentivePlan>>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<List<IncentivePlan>>> _load() async {
    final result = await ref.read(incentiveApiProvider).listPlans();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

/// The viewer's own incentive for the current period — the card a rep sees.
final myIncentiveProvider =
    AsyncNotifierProvider<MyIncentiveController, Result<MyIncentive>>(
      MyIncentiveController.new,
    );

class MyIncentiveController extends AsyncNotifier<Result<MyIncentive>> {
  @override
  Future<Result<MyIncentive>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<MyIncentive>> _load() async {
    final result = await ref.read(incentiveApiProvider).mine();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
