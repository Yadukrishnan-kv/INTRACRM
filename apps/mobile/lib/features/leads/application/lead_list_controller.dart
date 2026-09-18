import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/lead_api.dart';
import '../data/lead_local_source.dart';
import '../data/lead_repository_impl.dart';
import '../domain/lead.dart';
import '../domain/lead_repository.dart';

final leadApiProvider = Provider<LeadApi>((ref) {
  return LeadApi(ref.watch(apiClientProvider));
});

final leadRepositoryProvider = Provider<LeadRepository>((ref) {
  return LeadRepositoryImpl(
    api: LeadApi(ref.watch(apiClientProvider)),
    local: LeadLocalSource(ref.watch(cacheStoreProvider)),
    outbox: ref.watch(outboxStoreProvider),
    offline: ref.watch(offlineStoreProvider),
    tokenStore: ref.watch(tokenStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    ids: ref.watch(idGeneratorProvider),
  );
});

final leadListControllerProvider =
    AsyncNotifierProvider<LeadListController, Result<PagedData<Lead>>>(
      LeadListController.new,
    );

class LeadListController extends AsyncNotifier<Result<PagedData<Lead>>> {
  var _loadingMore = false;

  @override
  Future<Result<PagedData<Lead>>> build() {
    return ref.read(leadRepositoryProvider).list();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await ref.read(leadRepositoryProvider).list());
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (_loadingMore || current is! Success<PagedData<Lead>>) {
      return;
    }
    final page = current.value.page;
    final cursor = page.nextCursor;
    if (!page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await ref.read(leadRepositoryProvider).list(cursor: cursor);
    _loadingMore = false;
    if (next is Success<PagedData<Lead>>) {
      state = AsyncData(
        Success(
          PagedData(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }
}
