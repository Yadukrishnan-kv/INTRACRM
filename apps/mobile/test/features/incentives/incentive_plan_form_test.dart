import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_client.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/features/incentives/application/incentive_providers.dart';
import 'package:intra_leads/features/incentives/data/incentive_api.dart';
import 'package:intra_leads/features/incentives/domain/incentive.dart';
import 'package:intra_leads/features/incentives/presentation/incentive_plan_form_page.dart';
import 'package:intra_leads/features/targets/application/target_providers.dart';
import 'package:intra_leads/features/targets/data/target_api.dart';
import 'package:intra_leads/features/targets/domain/target.dart';

final _meta = ResponseMeta(requestId: 'r', timestamp: DateTime.utc(2026, 10, 5));

Success<ApiSuccess<T>> _ok<T>(T data) => Success(ApiSuccess(data: data, meta: _meta));

class _FakeTargetApi extends TargetApi {
  _FakeTargetApi() : super(ApiClient(Dio()));

  @override
  Future<Result<ApiSuccess<TargetCatalog>>> catalog() async => _ok(
        const TargetCatalog(
          metrics: [
            TargetMetric(code: 'revenue', name: 'Revenue', unit: 'minor_currency'),
            TargetMetric(code: 'quotations_accepted', name: 'Quotations accepted', unit: 'count'),
          ],
        ),
      );
}

/// Records every write so the test can assert the exact sequence of calls.
class _FakeIncentiveApi extends IncentiveApi {
  _FakeIncentiveApi() : super(ApiClient(Dio()));

  final calls = <String>[];
  final bodies = <Map<String, dynamic>>[];

  /// Fail the next addSlab once, to exercise resuming a half-saved plan.
  bool failNextSlab = false;
  var _slabSeq = 0;

  IncentivePlan _plan(String status, int version) => IncentivePlan(
        id: 'plan-1',
        name: 'Monthly Revenue',
        metricCode: 'revenue',
        metricName: 'Revenue',
        periodType: 'monthly',
        basis: 'revenue',
        status: status,
        effectiveFrom: '2026-10-01',
        version: version,
      );

  @override
  Future<Result<ApiSuccess<IncentivePlan>>> createPlan(Map<String, dynamic> body) async {
    calls.add('createPlan');
    bodies.add(body);
    return _ok(_plan('draft', 1));
  }

  @override
  Future<Result<ApiSuccess<IncentivePlan>>> updatePlan(String planId, Map<String, dynamic> body) async {
    calls.add('updatePlan:${body['status'] ?? 'fields'}');
    bodies.add(body);
    return _ok(_plan(body['status'] as String? ?? 'draft', 2));
  }

  @override
  Future<Result<ApiSuccess<IncentiveSlab>>> addSlab(String planId, Map<String, dynamic> body) async {
    calls.add('addSlab:${body['fromBps']}');
    bodies.add(body);
    if (failNextSlab) {
      failNextSlab = false;
      return const Err(ConflictFailure('This band overlaps an existing slab'));
    }
    return _ok(IncentiveSlab(id: 'slab-${_slabSeq++}', fromBps: body['fromBps'] as int, payoutKind: 'percent'));
  }
}

Future<_FakeIncentiveApi> _pumpForm(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(420, 2400));
  final api = _FakeIncentiveApi();
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => const Scaffold(body: Text('plans')),
        routes: [GoRoute(path: 'new', builder: (_, _) => const IncentivePlanFormPage())],
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        targetApiProvider.overrideWithValue(_FakeTargetApi()),
        incentiveApiProvider.overrideWithValue(api),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  unawaited(router.push('/new'));
  await tester.pumpAndSettle();
  return api;
}

Finder _field(String label) => find.widgetWithText(TextFormField, label);

Future<void> _addBand(WidgetTester tester, {required String from, String to = '', required String pay, String bonus = ''}) async {
  await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Add band'));
  await tester.tap(find.widgetWithText(OutlinedButton, 'Add band'));
  await tester.pumpAndSettle();
  await tester.enterText(_field('From % of target'), from);
  await tester.enterText(_field('Up to % (optional)'), to);
  await tester.enterText(_field('Pay % of sales'), pay);
  if (bonus.isNotEmpty) {
    await tester.enterText(_field('Bonus ₹ for reaching this band (optional)'), bonus);
  }
  await tester.tap(find.widgetWithText(FilledButton, 'Add band'));
  await tester.pumpAndSettle();
}

Future<void> _tapCreate(WidgetTester tester) async {
  final button = find.widgetWithText(FilledButton, 'Create plan');
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('creates the plan as a draft, adds bands, then activates it', (tester) async {
    final api = await _pumpForm(tester);

    await tester.enterText(_field('Plan name'), 'Monthly Revenue');
    await tester.enterText(_field('Hold back %'), '10');
    await tester.enterText(_field('Payout cap ₹ (optional)'), '50,000');
    await _addBand(tester, from: '80', to: '100', pay: '2');
    await _addBand(tester, from: '100', pay: '3', bonus: '5000');

    expect(find.text('80% – 100%'), findsOneWidget);
    expect(find.text('100%+'), findsOneWidget);

    await tester.ensureVisible(find.text('Active'));
    await tester.tap(find.text('Active'));
    await tester.pumpAndSettle();
    await _tapCreate(tester);

    expect(api.calls, ['createPlan', 'addSlab:8000', 'addSlab:10000', 'updatePlan:active']);
    expect(api.bodies[0], containsPair('status', 'draft'));
    expect(api.bodies[0], containsPair('basis', 'revenue'));
    expect(api.bodies[0], containsPair('minAttainmentBps', 8000));
    expect(api.bodies[0], containsPair('holdBps', 1000));
    expect(api.bodies[0], containsPair('payoutCap', 5000000));
    expect(api.bodies[1], {'fromBps': 8000, 'toBps': 10000, 'payoutKind': 'percent', 'rateBps': 200, 'bonusAmount': 0});
    expect(api.bodies[2], {'fromBps': 10000, 'payoutKind': 'percent', 'rateBps': 300, 'bonusAmount': 500000});
    expect(find.text('plans'), findsOneWidget, reason: 'returns to the list once saved');
  });

  testWidgets('resumes after a band fails: only the failed band is sent again', (tester) async {
    final api = await _pumpForm(tester);

    await tester.enterText(_field('Plan name'), 'Monthly Revenue');
    await _addBand(tester, from: '80', pay: '2');
    api.failNextSlab = true;
    await _tapCreate(tester);

    expect(api.calls, ['createPlan', 'addSlab:8000']);
    expect(find.text('80%+: This band overlaps an existing slab'), findsOneWidget);
    expect(find.text('plans'), findsNothing, reason: 'stays on the form to retry');

    await tester.pumpAndSettle(const Duration(seconds: 5));
    api.calls.clear();
    await _tapCreate(tester);

    // The plan already exists, so the retry patches it instead of creating
    // a second one, and re-sends just the band that failed.
    expect(api.calls, ['updatePlan:fields', 'addSlab:8000']);
    expect(find.text('plans'), findsOneWidget);
  });

  testWidgets('refuses an overlapping band before anything is sent', (tester) async {
    final api = await _pumpForm(tester);

    await _addBand(tester, from: '80', to: '120', pay: '2');
    await _addBand(tester, from: '100', pay: '3');

    expect(find.textContaining('Overlaps the 80% – 120% band'), findsOneWidget);
    expect(api.calls, isEmpty);
  });
}
