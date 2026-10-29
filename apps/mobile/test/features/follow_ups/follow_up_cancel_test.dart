import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/features/follow_ups/application/follow_up_providers.dart';
import 'package:intra_leads/features/follow_ups/data/follow_up_api.dart';
import 'package:intra_leads/features/follow_ups/domain/follow_up_repository.dart';
import 'package:intra_leads/features/follow_ups/presentation/follow_up_detail_page.dart';
import 'package:intra_leads/features/leads/domain/lead.dart';
import 'package:intra_leads/l10n/app_strings.dart';

import '../../support/test_harness.dart';

LeadFollowUp _followUp({String status = 'pending'}) => LeadFollowUp(
  id: 'fu-1',
  title: 'Call back',
  dueAt: DateTime.utc(2026, 10, 30, 10),
  priority: 1,
  status: status,
  assignedToMembershipId: 'member-me',
  version: 4,
);

class _FakeRepository implements FollowUpRepository {
  _FakeRepository(this.item);

  LeadFollowUp item;

  @override
  Future<Result<LeadFollowUp>> getById(String id) async => Success(item);

  @override
  Future<Result<PagedData<LeadFollowUp>>> list({
    String? cursor,
    String? status,
    String? type,
    String? leadId,
    bool? overdue,
  }) async {
    return const Success(PagedData(items: [], page: PageMeta(limit: 20, hasMore: false)));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFollowUpApi extends FollowUpApi {
  _FakeFollowUpApi({this.error}) : super(offlineClient());

  final Failure? error;
  final calls = <(String, int)>[];

  @override
  Future<Result<ApiSuccess<LeadFollowUp>>> cancel({
    required String id,
    required int version,
    String? reason,
  }) async {
    calls.add((id, version));
    final failure = error;
    return failure == null ? ok(_followUp(status: 'cancelled')) : Err(failure);
  }
}

Future<_FakeFollowUpApi> _pump(
  WidgetTester tester, {
  String status = 'pending',
  List<String> permissions = const ['follow_up:update'],
  Failure? error,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  addTearDown(tester.view.reset);
  final api = _FakeFollowUpApi(error: error);
  await pumpPage(
    tester,
    const FollowUpDetailPage(followUpId: 'fu-1'),
    overrides: [
      authOverride(testUser(permissions)),
      followUpApiProvider.overrideWithValue(api),
      followUpRepositoryProvider.overrideWithValue(_FakeRepository(_followUp(status: status))),
    ],
  );
  return api;
}

final _cancelAction = find.widgetWithText(TextButton, AppStrings.cancelFollowUp);
final _confirm = find.widgetWithText(FilledButton, AppStrings.cancelFollowUp);

void main() {
  testWidgets('cancel shows for a pending follow-up with follow_up:update', (tester) async {
    await _pump(tester);
    expect(_cancelAction, findsOneWidget);
  });

  testWidgets('cancel is hidden when not pending', (tester) async {
    await _pump(tester, status: 'completed');
    expect(_cancelAction, findsNothing);
  });

  testWidgets('cancel is hidden without follow_up:update', (tester) async {
    await _pump(tester, permissions: const ['follow_up:complete']);
    expect(_cancelAction, findsNothing);
  });

  testWidgets('confirming calls cancel with the id and version', (tester) async {
    final api = await _pump(tester);
    await tester.tap(_cancelAction);
    await tester.pumpAndSettle();
    await tester.tap(_confirm);
    await tester.pumpAndSettle();
    expect(api.calls, [('fu-1', 4)]);
  });

  testWidgets('dismissing the dialog makes no call', (tester) async {
    final api = await _pump(tester);
    await tester.tap(_cancelAction);
    await tester.pumpAndSettle();
    await tester.tap(find.text(AppStrings.cancel));
    await tester.pumpAndSettle();
    expect(api.calls, isEmpty);
  });

  testWidgets('a 409 message is shown in a snackbar', (tester) async {
    await _pump(
      tester,
      error: const ConflictFailure('Only a pending follow-up can be cancelled.'),
    );
    await tester.tap(_cancelAction);
    await tester.pumpAndSettle();
    await tester.tap(_confirm);
    await tester.pumpAndSettle();
    expect(find.text('Only a pending follow-up can be cancelled.'), findsOneWidget);
  });

  test('cancel sends POST /follow-ups/:id/cancel with the version', () async {
    final recorder = RecordingClient({
      'id': 'fu-1',
      'title': 'Call back',
      'dueAt': '2026-10-30T10:00:00.000Z',
      'status': 'cancelled',
      'version': 5,
    });
    await FollowUpApi(recorder.client).cancel(id: 'fu-1', version: 4, reason: 'Duplicate');
    final request = recorder.requests.single;
    expect(request.method, 'POST');
    expect(request.path, '/follow-ups/fu-1/cancel');
    expect(request.data, {'version': 4, 'reason': 'Duplicate'});
  });
}
