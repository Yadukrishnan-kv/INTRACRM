import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/domain/lead.dart';
import '../../staff/application/staff_providers.dart';
import '../../staff/domain/staff_models.dart';
import '../data/follow_up_api.dart';
import '../data/follow_up_repository_impl.dart';
import '../domain/follow_up_calendar.dart';
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

/// Which month the calendar is showing, whose follow-ups, and which day the
/// agenda below the grid is for.
class FollowUpCalendarFilter {
  const FollowUpCalendarFilter({
    this.month,
    this.assignedToMembershipId,
    this.type,
    this.selectedDay,
  });

  /// `YYYY-MM`. Null asks the server for the current month in the tenant zone,
  /// which is the only party that knows it.
  final String? month;
  final String? assignedToMembershipId;
  final String? type;

  /// Null until the month loads, then the month's own default day.
  final String? selectedDay;

  FollowUpCalendarFilter copyWith({
    String? month,
    Object? assignedToMembershipId = _unset,
    Object? type = _unset,
    Object? selectedDay = _unset,
  }) {
    return FollowUpCalendarFilter(
      month: month ?? this.month,
      assignedToMembershipId: assignedToMembershipId == _unset
          ? this.assignedToMembershipId
          : assignedToMembershipId as String?,
      type: type == _unset ? this.type : type as String?,
      selectedDay: selectedDay == _unset ? this.selectedDay : selectedDay as String?,
    );
  }

  static const _unset = Object();
}

final followUpCalendarFilterProvider = StateProvider<FollowUpCalendarFilter>((ref) {
  return const FollowUpCalendarFilter();
});

final followUpCalendarProvider =
    AsyncNotifierProvider<FollowUpCalendarController, Result<FollowUpCalendarMonth>>(
      FollowUpCalendarController.new,
    );

class FollowUpCalendarController extends AsyncNotifier<Result<FollowUpCalendarMonth>> {
  @override
  Future<Result<FollowUpCalendarMonth>> build() {
    // The selected day is a local concern; only month, owner and type change
    // what the server has to count.
    final filter = ref.watch(
      followUpCalendarFilterProvider.select(
        (value) => (value.month, value.assignedToMembershipId, value.type),
      ),
    );
    return _load(month: filter.$1, membershipId: filter.$2, type: filter.$3);
  }

  Future<void> refresh() async {
    final filter = ref.read(followUpCalendarFilterProvider);
    state = const AsyncLoading();
    state = AsyncData(
      await _load(
        month: filter.month,
        membershipId: filter.assignedToMembershipId,
        type: filter.type,
      ),
    );
  }

  Future<Result<FollowUpCalendarMonth>> _load({
    String? month,
    String? membershipId,
    String? type,
  }) async {
    final result = await ref.read(followUpApiProvider).calendar(
          month: month,
          assignedToMembershipId: membershipId,
          type: type,
        );
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }
}

/// The agenda under the grid: every follow-up due on the selected day.
final followUpDayAgendaProvider =
    FutureProvider.autoDispose.family<Result<List<LeadFollowUp>>, String>((ref, day) async {
  final filter = ref.watch(followUpCalendarFilterProvider);
  final result = await ref.read(followUpApiProvider).list(
        dueOn: day,
        assignedToMembershipId: filter.assignedToMembershipId,
        type: filter.type,
        limit: 100,
      );
  return switch (result) {
    Success(:final value) => Success(value.data),
    Err(:final failure) => Err(failure),
  };
});

/// Active staff for the calendar's "All Users" picker. Kept alive for the
/// session: the list is small and changes far less often than the month.
final followUpOwnerOptionsProvider = FutureProvider<List<StaffMember>>((ref) async {
  final result = await ref.read(staffApiProvider).listStaff(status: 'active');
  return switch (result) {
    Success(:final value) => value.data,
    Err() => const <StaffMember>[],
  };
});
