import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/features/staff/application/staff_providers.dart';
import 'package:intra_leads/features/staff/data/staff_api.dart';
import 'package:intra_leads/features/staff/domain/staff_models.dart';
import 'package:intra_leads/features/staff/presentation/staff_detail_page.dart';
import 'package:intra_leads/l10n/app_strings.dart';

import '../../support/test_harness.dart';

StaffMember _member(String id, {String? userId}) => StaffMember(
  id: id,
  status: 'active',
  active: true,
  fullName: 'Asha Rao',
  roles: const [],
  teams: const [],
  userId: userId,
);

class _FakeStaffApi extends StaffApi {
  _FakeStaffApi(this.member, {this.removeError}) : super(offlineClient());

  final StaffMember member;
  final Failure? removeError;
  final removed = <String>[];

  @override
  Future<Result<ApiSuccess<StaffMember>>> getStaff(String id) async => ok(member);

  @override
  Future<Result<ApiSuccess<Object?>>> removeStaff(String id) async {
    removed.add(id);
    final error = removeError;
    return error == null ? ok<Object?>({'id': id, 'removed': true}) : Err(error);
  }
}

Future<_FakeStaffApi> _pump(
  WidgetTester tester, {
  required StaffMember member,
  List<String> permissions = const ['tenant:manage_users'],
  Failure? removeError,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  addTearDown(tester.view.reset);
  final api = _FakeStaffApi(member, removeError: removeError);
  await pumpPage(
    tester,
    StaffDetailPage(staffId: member.id),
    overrides: [
      authOverride(testUser(permissions)),
      staffApiProvider.overrideWithValue(api),
    ],
  );
  return api;
}

final _removeButton = find.widgetWithText(OutlinedButton, AppStrings.removeFromWorkspace);
final _confirmButton = find.widgetWithText(FilledButton, AppStrings.removeFromWorkspace);

void main() {
  testWidgets('remove is offered for another member with manage_users', (tester) async {
    await _pump(tester, member: _member('member-2', userId: 'user-2'));
    expect(_removeButton, findsOneWidget);
  });

  testWidgets('remove is hidden on your own record (membership or user id)', (tester) async {
    await _pump(tester, member: _member('member-me', userId: 'user-x'));
    expect(_removeButton, findsNothing);
    await _pump(tester, member: _member('member-x', userId: 'user-me'));
    expect(_removeButton, findsNothing);
  });

  testWidgets('remove is hidden without manage_users', (tester) async {
    await _pump(tester, member: _member('member-2'), permissions: const []);
    expect(_removeButton, findsNothing);
  });

  testWidgets('confirming removes the member and pops back', (tester) async {
    final api = await _pump(tester, member: _member('member-2'));
    await tester.tap(_removeButton);
    await tester.pumpAndSettle();
    await tester.tap(_confirmButton);
    await tester.pumpAndSettle();

    expect(api.removed, ['member-2']);
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('cancelling the dialog makes no call', (tester) async {
    final api = await _pump(tester, member: _member('member-2'));
    await tester.tap(_removeButton);
    await tester.pumpAndSettle();
    await tester.tap(find.text(AppStrings.cancel));
    await tester.pumpAndSettle();

    expect(api.removed, isEmpty);
    expect(_removeButton, findsOneWidget);
  });

  testWidgets('an API error is shown in a snackbar', (tester) async {
    final api = await _pump(
      tester,
      member: _member('member-2'),
      removeError: const ForbiddenFailure('Only a founder can remove a founder.'),
    );
    await tester.tap(_removeButton);
    await tester.pumpAndSettle();
    await tester.tap(_confirmButton);
    await tester.pumpAndSettle();

    expect(api.removed, ['member-2']);
    expect(find.text('Only a founder can remove a founder.'), findsOneWidget);
    expect(_removeButton, findsOneWidget);
  });

  test('removeStaff sends DELETE /staff/:id', () async {
    final recorder = RecordingClient({'id': 'member-2', 'removed': true});
    await StaffApi(recorder.client).removeStaff('member-2');
    expect(recorder.requests.single.method, 'DELETE');
    expect(recorder.requests.single.path, '/staff/member-2');
  });
}
