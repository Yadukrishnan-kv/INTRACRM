import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/timeline_api.dart';
import '../domain/timeline_models.dart';

final timelineApiProvider = Provider<TimelineApi>((ref) {
  return TimelineApi(ref.watch(apiClientProvider));
});

class TimelinePage {
  const TimelinePage({required this.items, required this.page});

  final List<TimelineEvent> items;
  final PageMeta page;
}

final timelineFeedProvider =
    AsyncNotifierProvider<TimelineFeedController, Result<TimelinePage>>(
      TimelineFeedController.new,
    );

class TimelineFeedController extends AsyncNotifier<Result<TimelinePage>> {
  String? _eventCode;
  var _loadingMore = false;

  @override
  Future<Result<TimelinePage>> build() {
    return _load();
  }

  Future<void> filter(String? eventCode) async {
    _eventCode = eventCode;
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = AsyncData(await _load());
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (_loadingMore || current is! Success<TimelinePage>) {
      return;
    }
    final cursor = current.value.page.nextCursor;
    if (!current.value.page.hasMore || cursor == null) {
      return;
    }
    _loadingMore = true;
    final next = await _load(cursor: cursor);
    _loadingMore = false;
    if (next is Success<TimelinePage>) {
      state = AsyncData(
        Success(
          TimelinePage(
            items: [...current.value.items, ...next.value.items],
            page: next.value.page,
          ),
        ),
      );
    }
  }

  Future<Result<TimelinePage>> _load({String? cursor}) async {
    final result = await ref.read(timelineApiProvider).list(
      cursor: cursor,
      eventCode: _eventCode,
    );
    return switch (result) {
      Success(:final value) => Success(
        TimelinePage(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }
}
