import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/quotation_api.dart';
import '../domain/quotation.dart';

final quotationApiProvider = Provider<QuotationApi>((ref) {
  return QuotationApi(ref.watch(apiClientProvider));
});

class QuotationPage {
  const QuotationPage({required this.items, required this.page});

  final List<Quotation> items;
  final PageMeta page;
}

class QuotationListFilter {
  const QuotationListFilter({this.status, this.leadId, this.pending = false, this.bucket});

  final String? status;
  final String? leadId;
  final bool pending;
  final String? bucket;
}

final quotationListProvider =
    AsyncNotifierProvider<QuotationListController, Result<QuotationPage>>(
      QuotationListController.new,
    );

class QuotationListController extends AsyncNotifier<Result<QuotationPage>> {
  QuotationListFilter _filter = const QuotationListFilter();
  var _loadingMore = false;

  QuotationListFilter get filter => _filter;

  @override
  Future<Result<QuotationPage>> build() {
    return _load();
  }

  Future<void> apply(QuotationListFilter filter) async {
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
    if (_loadingMore || current is! Success<QuotationPage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<QuotationPage>) {
      state = AsyncData(
        Success(
          QuotationPage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<QuotationPage>> _load({String? cursor}) async {
    final result = await ref.read(quotationApiProvider).list(
      cursor: cursor,
      status: _filter.bucket != null || _filter.pending ? null : _filter.status,
      leadId: _filter.leadId,
      pending: _filter.bucket == null && _filter.pending ? true : null,
      bucket: _filter.bucket,
    );
    return switch (result) {
      Success(:final value) => Success(
        QuotationPage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}

final quotationDashboardProvider =
    AsyncNotifierProvider<QuotationDashboardController, Result<QuotationFollowUpDashboard>>(
      QuotationDashboardController.new,
    );

class QuotationDashboardController extends AsyncNotifier<Result<QuotationFollowUpDashboard>> {
  @override
  Future<Result<QuotationFollowUpDashboard>> build() {
    return _load();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<Result<QuotationFollowUpDashboard>> _load() async {
    final result = await ref.read(quotationApiProvider).dashboard();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}
