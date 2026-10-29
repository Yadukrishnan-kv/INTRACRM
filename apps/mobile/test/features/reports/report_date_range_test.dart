import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/reports/domain/report_date_range.dart';

void main() {
  final range = ReportDateRange(
    from: DateTime(2026, 10, 1, 15, 30),
    to: DateTime(2026, 10, 31, 9),
  );

  test('ymd mode sends inclusive calendar dates', () {
    expect(range.toQuery(ReportDateMode.ymd), {'from': '2026-10-01', 'to': '2026-10-31'});
  });

  test('instant mode sends ISO instants with an exclusive end', () {
    final query = range.toQuery(ReportDateMode.instant);
    expect(DateTime.parse(query['from']!).toLocal(), DateTime(2026, 10, 1));
    expect(DateTime.parse(query['to']!).toLocal(), DateTime(2026, 11, 1));
  });

  test('no range means no params', () {
    expect(reportRangeQuery(null, ReportDateMode.instant), isEmpty);
  });

  test('label collapses a single day', () {
    expect(ReportDateRange(from: DateTime(2026, 1, 2), to: DateTime(2026, 1, 2)).label, '2026-01-02');
    expect(range.label, '2026-10-01 → 2026-10-31');
  });
}
