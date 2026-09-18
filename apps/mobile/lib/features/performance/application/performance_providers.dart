import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/performance_api.dart';
import '../domain/performance.dart';

final performanceApiProvider = Provider<PerformanceApi>((ref) {
  return PerformanceApi(ref.watch(apiClientProvider));
});

final performanceCatalogProvider = FutureProvider<Result<PerformanceCatalog>>((ref) async {
  final result = await ref.watch(performanceApiProvider).catalog();
  return switch (result) {
    Success(:final value) => Success(value.data),
    Err(:final failure) => Err(failure),
  };
});

class PerformanceFilter {
  const PerformanceFilter({this.periodType = 'monthly', this.teamId, this.board = PerformanceBoards.overall});

  final String periodType;
  final String? teamId;
  final String board;
}

final performanceBoardProvider =
    AsyncNotifierProvider<PerformanceBoardController, Result<PerformanceBoard>>(
      PerformanceBoardController.new,
    );

class PerformanceBoardController extends AsyncNotifier<Result<PerformanceBoard>> {
  PerformanceFilter _filter = const PerformanceFilter();

  PerformanceFilter get filter => _filter;

  @override
  Future<Result<PerformanceBoard>> build() {
    return _load();
  }

  Future<void> apply(PerformanceFilter filter) async {
    _filter = filter;
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<PerformanceBoard>> _load() async {
    final result = await ref.read(performanceApiProvider).leaderboard(
      periodType: _filter.periodType,
      teamId: _filter.teamId,
    );
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
