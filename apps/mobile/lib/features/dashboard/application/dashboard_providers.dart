import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/dashboard_api.dart';
import '../domain/dashboard.dart';

final dashboardApiProvider = Provider<DashboardApi>((ref) {
  return DashboardApi(ref.watch(apiClientProvider));
});

final dashboardOverviewProvider =
    AsyncNotifierProvider<DashboardOverviewController, Result<DashboardOverview>>(
      DashboardOverviewController.new,
    );

class DashboardOverviewController extends AsyncNotifier<Result<DashboardOverview>> {
  @override
  Future<Result<DashboardOverview>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<DashboardOverview>> _load() async {
    final result = await ref.read(dashboardApiProvider).overview();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

final staffDashboardProvider =
    AsyncNotifierProvider<StaffDashboardController, Result<StaffDashboard>>(
      StaffDashboardController.new,
    );

class StaffDashboardController extends AsyncNotifier<Result<StaffDashboard>> {
  @override
  Future<Result<StaffDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<StaffDashboard>> _load() async {
    final result = await ref.read(dashboardApiProvider).mine();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
