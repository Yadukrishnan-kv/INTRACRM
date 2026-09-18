import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/site_visit_api.dart';
import '../domain/site_visit.dart';

final siteVisitApiProvider = Provider<SiteVisitApi>((ref) {
  return SiteVisitApi(ref.watch(apiClientProvider));
});

class SiteVisitPage {
  const SiteVisitPage({required this.items, required this.page});

  final List<SiteVisit> items;
  final PageMeta page;
}

class SiteVisitListFilter {
  const SiteVisitListFilter({this.status, this.overdue = false, this.leadId});

  final String? status;
  final bool overdue;
  final String? leadId;
}

final siteVisitListProvider =
    AsyncNotifierProvider<SiteVisitListController, Result<SiteVisitPage>>(
      SiteVisitListController.new,
    );

class SiteVisitListController extends AsyncNotifier<Result<SiteVisitPage>> {
  SiteVisitListFilter _filter = const SiteVisitListFilter(status: 'scheduled');
  var _loadingMore = false;

  SiteVisitListFilter get filter => _filter;

  @override
  Future<Result<SiteVisitPage>> build() {
    return _load();
  }

  Future<void> apply(SiteVisitListFilter filter) async {
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
    if (_loadingMore || current is! Success<SiteVisitPage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<SiteVisitPage>) {
      state = AsyncData(
        Success(
          SiteVisitPage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<SiteVisitPage>> _load({String? cursor}) async {
    final result = await ref.read(siteVisitApiProvider).list(
      cursor: cursor,
      status: _filter.overdue ? null : _filter.status,
      leadId: _filter.leadId,
      overdue: _filter.overdue ? true : null,
    );
    return switch (result) {
      Success(:final value) => Success(
        SiteVisitPage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}
