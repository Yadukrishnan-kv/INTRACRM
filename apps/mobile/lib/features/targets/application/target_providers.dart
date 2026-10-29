import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/target_api.dart';
import '../domain/sales_board.dart';
import '../domain/target.dart';

final targetApiProvider = Provider<TargetApi>((ref) {
  return TargetApi(ref.watch(apiClientProvider));
});

class TargetPage {
  const TargetPage({required this.items, required this.page});

  final List<Target> items;
  final PageMeta page;
}

class TargetListFilter {
  const TargetListFilter({
    this.periodType,
    this.scopeType,
    this.hasProduct = false,
  });

  final String? periodType;
  final String? scopeType;
  final bool hasProduct;
}

final targetListProvider = AsyncNotifierProvider<TargetListController, Result<TargetPage>>(
  TargetListController.new,
);

class TargetListController extends AsyncNotifier<Result<TargetPage>> {
  TargetListFilter _filter = const TargetListFilter();
  var _loadingMore = false;

  TargetListFilter get filter => _filter;

  @override
  Future<Result<TargetPage>> build() {
    return _load();
  }

  Future<void> apply(TargetListFilter filter) async {
    _filter = filter;
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (_loadingMore || current is! Success<TargetPage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<TargetPage>) {
      state = AsyncData(
        Success(
          TargetPage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<TargetPage>> _load({String? cursor}) async {
    final result = await ref.read(targetApiProvider).list(
      cursor: cursor,
      periodType: _filter.periodType,
      scopeType: _filter.scopeType,
      hasProduct: _filter.hasProduct ? true : null,
    );
    return switch (result) {
      Success(:final value) => Success(
        TargetPage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}

final targetProgressProvider =
    AsyncNotifierProvider<TargetProgressController, Result<TargetProgressDashboard>>(
      TargetProgressController.new,
    );

class TargetProgressController extends AsyncNotifier<Result<TargetProgressDashboard>> {
  @override
  Future<Result<TargetProgressDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<TargetProgressDashboard>> _load() async {
    final result = await ref.read(targetApiProvider).progress();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

/// Which slice of the sales board is on screen. Held outside the controller
/// so a period or scope change rebuilds through the same load path as a pull
/// to refresh.
class SalesBoardFilter {
  const SalesBoardFilter({
    this.period = 'this_month',
    this.scope = 'tenant',
    this.mine = false,
  });

  final String period;
  final String scope;

  /// The "My Target" toggle. It picks which card the board renders; both
  /// cards arrive in one response, so flipping it never refetches.
  final bool mine;

  SalesBoardFilter copyWith({String? period, String? scope, bool? mine}) {
    return SalesBoardFilter(
      period: period ?? this.period,
      scope: scope ?? this.scope,
      mine: mine ?? this.mine,
    );
  }
}

final salesBoardFilterProvider = StateProvider<SalesBoardFilter>((ref) {
  return const SalesBoardFilter();
});

final salesBoardProvider = AsyncNotifierProvider<SalesBoardController, Result<SalesBoard>>(
  SalesBoardController.new,
);

class SalesBoardController extends AsyncNotifier<Result<SalesBoard>> {
  @override
  Future<Result<SalesBoard>> build() {
    // Watched, not read: changing period or scope reloads the board, while
    // the local-only "mine" toggle is filtered out below.
    final filter = ref.watch(
      salesBoardFilterProvider.select((value) => (value.period, value.scope)),
    );
    return _load(period: filter.$1, scope: filter.$2);
  }

  Future<void> refresh() async {
    final filter = ref.read(salesBoardFilterProvider);
    state = const AsyncLoading();
    state = AsyncData(await _load(period: filter.period, scope: filter.scope));
  }

  Future<Result<SalesBoard>> _load({required String period, required String scope}) async {
    final result = await ref
        .read(targetApiProvider)
        .salesBoard(period: period, scope: scope);
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
