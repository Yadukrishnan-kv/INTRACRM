import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/analytics_api.dart';
import '../domain/analytics.dart';

final analyticsApiProvider = Provider<AnalyticsApi>((ref) {
  return AnalyticsApi(ref.watch(apiClientProvider));
});

final analyticsOverviewProvider =
    AsyncNotifierProvider<AnalyticsOverviewController, Result<AnalyticsDashboard>>(
      AnalyticsOverviewController.new,
    );

class AnalyticsOverviewController extends AsyncNotifier<Result<AnalyticsDashboard>> {
  @override
  Future<Result<AnalyticsDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<AnalyticsDashboard>> _load() async {
    final result = await ref.read(analyticsApiProvider).overview();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

final staffAnalyticsProvider =
    AsyncNotifierProvider<StaffAnalyticsController, Result<AnalyticsDashboard>>(
      StaffAnalyticsController.new,
    );

class StaffAnalyticsController extends AsyncNotifier<Result<AnalyticsDashboard>> {
  @override
  Future<Result<AnalyticsDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<AnalyticsDashboard>> _load() async {
    final result = await ref.read(analyticsApiProvider).mine();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
