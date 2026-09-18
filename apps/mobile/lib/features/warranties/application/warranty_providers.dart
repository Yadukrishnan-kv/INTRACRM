import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/warranty_api.dart';
import '../domain/warranty.dart';

final warrantyApiProvider = Provider<WarrantyApi>((ref) {
  return WarrantyApi(ref.watch(apiClientProvider));
});

class WarrantyPage {
  const WarrantyPage({required this.items, required this.page});

  final List<Warranty> items;
  final PageMeta page;
}

class WarrantyListFilter {
  const WarrantyListFilter({this.status, this.leadId, this.quotationId});

  final String? status;
  final String? leadId;
  final String? quotationId;
}

final warrantyListProvider =
    AsyncNotifierProvider<WarrantyListController, Result<WarrantyPage>>(
      WarrantyListController.new,
    );

class WarrantyListController extends AsyncNotifier<Result<WarrantyPage>> {
  WarrantyListFilter _filter = const WarrantyListFilter();
  var _loadingMore = false;

  WarrantyListFilter get filter => _filter;

  @override
  Future<Result<WarrantyPage>> build() {
    return _load();
  }

  Future<void> apply(WarrantyListFilter filter) async {
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
    if (_loadingMore || current is! Success<WarrantyPage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<WarrantyPage>) {
      state = AsyncData(
        Success(
          WarrantyPage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<WarrantyPage>> _load({String? cursor}) async {
    final result = await ref.read(warrantyApiProvider).list(
      cursor: cursor,
      status: _filter.status,
      leadId: _filter.leadId,
      quotationId: _filter.quotationId,
    );
    return switch (result) {
      Success(:final value) => Success(
        WarrantyPage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}
