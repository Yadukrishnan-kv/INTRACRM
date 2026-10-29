import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../reports/domain/report_date_range.dart';
import '../data/analytics_api.dart';
import '../domain/analytics.dart';

final analyticsApiProvider = Provider<AnalyticsApi>((ref) {
  return AnalyticsApi(ref.watch(apiClientProvider));
});

/// Date range for the company analytics board (and its metric detail pages).
/// Null means the API default, the current month.
final analyticsRangeProvider = StateProvider<ReportDateRange?>((ref) => null);

final analyticsOverviewProvider =
    AsyncNotifierProvider<AnalyticsOverviewController, Result<AnalyticsDashboard>>(
      AnalyticsOverviewController.new,
    );

class AnalyticsOverviewController extends AsyncNotifier<Result<AnalyticsDashboard>> {
  @override
  Future<Result<AnalyticsDashboard>> build() {
    return _load(ref.watch(analyticsRangeProvider));
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load(ref.read(analyticsRangeProvider)));
  }

  Future<Result<AnalyticsDashboard>> _load(ReportDateRange? range) async {
    final result = await ref.read(analyticsApiProvider).overview(range: range);
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

/// Date range for the personal analytics board; null means the current month.
final staffAnalyticsRangeProvider = StateProvider<ReportDateRange?>((ref) => null);

final staffAnalyticsProvider =
    AsyncNotifierProvider<StaffAnalyticsController, Result<AnalyticsDashboard>>(
      StaffAnalyticsController.new,
    );

class StaffAnalyticsController extends AsyncNotifier<Result<AnalyticsDashboard>> {
  @override
  Future<Result<AnalyticsDashboard>> build() {
    return _load(ref.watch(staffAnalyticsRangeProvider));
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load(ref.read(staffAnalyticsRangeProvider)));
  }

  Future<Result<AnalyticsDashboard>> _load(ReportDateRange? range) async {
    final result = await ref.read(analyticsApiProvider).mine(range: range);
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
