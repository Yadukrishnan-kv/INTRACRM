import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/domain/lead.dart';
import '../data/follow_up_api.dart';
import '../data/follow_up_repository_impl.dart';
import '../domain/follow_up_dashboard.dart';
import '../domain/follow_up_repository.dart';

final followUpApiProvider = Provider<FollowUpApi>((ref) {
  return FollowUpApi(ref.watch(apiClientProvider));
});

final followUpRepositoryProvider = Provider<FollowUpRepository>((ref) {
  return FollowUpRepositoryImpl(
    api: ref.watch(followUpApiProvider),
    offline: ref.watch(offlineStoreProvider),
    outbox: ref.watch(outboxStoreProvider),
    tokenStore: ref.watch(tokenStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    ids: ref.watch(idGeneratorProvider),
    membershipId: () => ref.read(authControllerProvider).user?.membershipId,
  );
});

class FollowUpPage {
  const FollowUpPage({required this.items, required this.page});

  final List<LeadFollowUp> items;
  final PageMeta page;
}

class FollowUpListFilter {
  const FollowUpListFilter({this.status, this.type, this.overdue = false, this.bucket});

  final String? status;
  final String? type;
  final bool overdue;
  final String? bucket;
}

final followUpListProvider =
    AsyncNotifierProvider<FollowUpListController, Result<FollowUpPage>>(
      FollowUpListController.new,
    );

class FollowUpListController extends AsyncNotifier<Result<FollowUpPage>> {
  FollowUpListFilter _filter = const FollowUpListFilter(status: 'pending');
  var _loadingMore = false;

  FollowUpListFilter get filter => _filter;

  @override
  Future<Result<FollowUpPage>> build() {
    return _load();
  }

  Future<void> apply(FollowUpListFilter filter) async {
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
    if (_loadingMore || current is! Success<FollowUpPage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<FollowUpPage>) {
      state = AsyncData(
        Success(
          FollowUpPage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<FollowUpPage>> _load({String? cursor}) async {
    if (_filter.bucket == 'no_follow_up') {
      return const Success(FollowUpPage(items: [], page: PageMeta(limit: 20, hasMore: false)));
    }
    final result = await ref.read(followUpRepositoryProvider).list(
      cursor: cursor,
      status: _filter.bucket != null || _filter.overdue ? null : _filter.status,
      type: _filter.type,
      overdue: _filter.bucket == null && _filter.overdue ? true : null,
    );
    return switch (result) {
      Success(:final value) => Success(
        FollowUpPage(items: value.items, page: value.page),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}

final followUpDashboardProvider =
    AsyncNotifierProvider<FollowUpDashboardController, Result<FollowUpDashboard>>(
      FollowUpDashboardController.new,
    );

class FollowUpDashboardController extends AsyncNotifier<Result<FollowUpDashboard>> {
  @override
  Future<Result<FollowUpDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<FollowUpDashboard>> _load() async {
    final result = await ref.read(followUpApiProvider).dashboard();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
