import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/features/incentives/application/incentive_providers.dart';
import 'package:intra_leads/features/incentives/data/incentive_api.dart';
import 'package:intra_leads/features/incentives/domain/incentive.dart';
import 'package:intra_leads/features/incentives/presentation/incentive_report_page.dart';
import 'package:intra_leads/features/reports/domain/report_date_range.dart';
import 'package:intra_leads/l10n/app_strings.dart';

import '../../support/test_harness.dart';

IncentivePayout _payout(String id, String status) => IncentivePayout(
  id: id,
  planId: 'plan-1',
  planName: 'Monthly Revenue',
  membershipName: 'Member $id',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  targetValue: 100,
  achievedValue: 80,
  earnedAmount: 5000,
  payableAmount: 5000,
  status: status,
  version: 1,
);

class _FakeIncentiveApi extends IncentiveApi {
  _FakeIncentiveApi() : super(offlineClient());

  final voided = <String>[];
  final ranges = <(String?, String?)>[];

  @override
  Future<Result<ApiSuccess<IncentiveReport>>> report({
    String? planId,
    String? membershipId,
    String? status,
    String? from,
    String? to,
  }) async {
    ranges.add((from, to));
    return ok(
      IncentiveReport(
        generatedAt: DateTime.utc(2026, 10, 28),
        totals: const IncentiveTotals(),
        items: [
          _payout('p-draft', 'draft'),
          _payout('p-approved', 'approved'),
          _payout('p-paid', 'paid'),
          _payout('p-void', 'void'),
        ],
      ),
    );
  }

  @override
  Future<Result<ApiSuccess<IncentivePayout>>> voidPayout(String payoutId, {String? notes}) async {
    voided.add(payoutId);
    return ok(_payout(payoutId, 'void'));
  }
}

Future<_FakeIncentiveApi> _pump(WidgetTester tester, List<String> permissions) async {
  tester.view.physicalSize = const Size(1080, 4000);
  addTearDown(tester.view.reset);
  final api = _FakeIncentiveApi();
  await pumpPage(
    tester,
    const IncentiveReportPage(),
    overrides: [
      authOverride(testUser(permissions)),
      incentiveApiProvider.overrideWithValue(api),
    ],
  );
  return api;
}

Finder _voidIconIn(String member) => find.descendant(
  of: find.widgetWithText(ListTile, member),
  matching: find.byTooltip(AppStrings.voidPayout),
);

void main() {
  testWidgets('void shows only on draft and approved payouts with incentive:manage', (tester) async {
    await _pump(tester, const ['incentive:read', 'incentive:manage']);
    expect(_voidIconIn('Member p-draft'), findsOneWidget);
    expect(_voidIconIn('Member p-approved'), findsOneWidget);
    expect(_voidIconIn('Member p-paid'), findsNothing);
    expect(_voidIconIn('Member p-void'), findsNothing);
  });

  testWidgets('void is hidden without incentive:manage', (tester) async {
    await _pump(tester, const ['incentive:read']);
    expect(find.byTooltip(AppStrings.voidPayout), findsNothing);
  });

  testWidgets('confirming voids the payout; cancelling does not', (tester) async {
    final api = await _pump(tester, const ['incentive:read', 'incentive:manage']);

    await tester.tap(_voidIconIn('Member p-approved'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(AppStrings.cancel));
    await tester.pumpAndSettle();
    expect(api.voided, isEmpty);

    await tester.tap(_voidIconIn('Member p-approved'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, AppStrings.voidPayout));
    await tester.pumpAndSettle();
    expect(api.voided, ['p-approved']);
  });

  test('voidPayout sends POST /incentives/payouts/:id/void', () async {
    final recorder = RecordingClient({'id': 'p-1', 'status': 'void'});
    await IncentiveApi(recorder.client).voidPayout('p-1', notes: 'Duplicate');
    final request = recorder.requests.single;
    expect(request.method, 'POST');
    expect(request.path, '/incentives/payouts/p-1/void');
    expect(request.data, {'notes': 'Duplicate'});
  });

  test('the incentive report sends the picked range as YYYY-MM-DD from/to', () async {
    final api = _FakeIncentiveApi();
    final container = ProviderContainer(
      overrides: [incentiveApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(incentiveReportProvider.future);
    container.read(incentiveReportFilterProvider.notifier).state = IncentiveReportFilter(
      range: ReportDateRange(from: DateTime(2026, 9, 1), to: DateTime(2026, 9, 30)),
    );
    await container.read(incentiveReportProvider.future);

    expect(api.ranges, [(null, null), ('2026-09-01', '2026-09-30')]);
  });
}
