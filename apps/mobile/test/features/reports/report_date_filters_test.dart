import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/features/analytics/application/analytics_providers.dart';
import 'package:intra_leads/features/analytics/data/analytics_api.dart';
import 'package:intra_leads/features/analytics/domain/analytics.dart';
import 'package:intra_leads/features/performance/data/performance_api.dart';
import 'package:intra_leads/features/reports/domain/report_date_range.dart';

import '../../support/test_harness.dart';

final _september = ReportDateRange(from: DateTime(2026, 9, 1), to: DateTime(2026, 9, 30));
const _septemberQuery = {'from': '2026-09-01', 'to': '2026-09-30'};

/// Records the range each dashboard load asked for; never returns data.
class _FakeAnalyticsApi extends AnalyticsApi {
  _FakeAnalyticsApi() : super(RecordingClient(null).client);

  final overviewRanges = <ReportDateRange?>[];
  final mineRanges = <ReportDateRange?>[];

  @override
  Future<Result<ApiSuccess<AnalyticsDashboard>>> overview({ReportDateRange? range}) async {
    overviewRanges.add(range);
    return const Err(UnexpectedFailure('not stubbed'));
  }

  @override
  Future<Result<ApiSuccess<AnalyticsDashboard>>> mine({ReportDateRange? range}) async {
    mineRanges.add(range);
    return const Err(UnexpectedFailure('not stubbed'));
  }
}

void main() {
  group('AnalyticsApi', () {
    final calls = <String, Future<Object?> Function(AnalyticsApi, ReportDateRange?)>{
      '/analytics': (api, range) => api.overview(range: range),
      '/analytics/me': (api, range) => api.mine(range: range),
      '/reports/analytics': (api, range) => api.report(range: range),
      '/analytics/funnel': (api, range) => api.funnel(range: range),
      '/analytics/funnel/me': (api, range) => api.mineFunnel(range: range),
    };

    for (final MapEntry(key: path, value: call) in calls.entries) {
      test('$path sends no from/to without a range', () async {
        final recorder = RecordingClient(null);
        await call(AnalyticsApi(recorder.client), null);
        expect(recorder.requests.single.path, path);
        expect(recorder.requests.single.query, isEmpty);
      });

      test('$path sends the range as inclusive YYYY-MM-DD from/to', () async {
        final recorder = RecordingClient(null);
        await call(AnalyticsApi(recorder.client), _september);
        expect(recorder.requests.single.path, path);
        expect(recorder.requests.single.query, _septemberQuery);
      });
    }
  });

  group('PerformanceApi.report', () {
    test('sends periodType without a range', () async {
      final recorder = RecordingClient(null);
      await PerformanceApi(recorder.client).report(periodType: 'daily');
      expect(recorder.requests.single.path, '/reports/performance');
      expect(recorder.requests.single.query, {'periodType': 'daily'});
    });

    test('sends only from/to with a range (the API ignores periodType then)', () async {
      final recorder = RecordingClient(null);
      await PerformanceApi(recorder.client).report(periodType: 'daily', range: _september);
      expect(recorder.requests.single.query, _septemberQuery);
    });
  });

  group('analytics providers', () {
    test('the company board reloads with the picked range', () async {
      final api = _FakeAnalyticsApi();
      final container = ProviderContainer(
        overrides: [analyticsApiProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);

      await container.read(analyticsOverviewProvider.future);
      container.read(analyticsRangeProvider.notifier).state = _september;
      await container.read(analyticsOverviewProvider.future);
      await container.read(analyticsOverviewProvider.notifier).refresh();

      expect(api.overviewRanges, [null, _september, _september]);
      expect(api.mineRanges, isEmpty);
    });

    test('the personal board has its own range', () async {
      final api = _FakeAnalyticsApi();
      final container = ProviderContainer(
        overrides: [analyticsApiProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);

      await container.read(staffAnalyticsProvider.future);
      container.read(staffAnalyticsRangeProvider.notifier).state = _september;
      await container.read(staffAnalyticsProvider.future);
      container.read(staffAnalyticsRangeProvider.notifier).state = null;
      await container.read(staffAnalyticsProvider.future);

      expect(api.mineRanges, [null, _september, null]);
      expect(container.read(analyticsRangeProvider), isNull);
    });
  });
}
