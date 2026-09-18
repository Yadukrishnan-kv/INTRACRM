import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/follow_ups/domain/follow_up_report.dart';
import 'package:intra_leads/features/leads/domain/lead_report.dart';
import 'package:intra_leads/features/quotations/domain/sales_report.dart';

void main() {
  test('parses a lead report envelope', () {
    final report = LeadReport.fromJson({
      'generatedAt': '2026-08-16T00:00:00.000Z',
      'totals': {'total': 3, 'open': 1, 'won': 1, 'lost': 1, 'winRateBps': 5000},
      'byLifecycle': [
        {'status': 'open', 'count': 1, 'valueMinor': 100},
      ],
    });
    expect(report.totals.total, 3);
    expect(report.totals.winRateBps, 5000);
    expect(report.byLifecycle.first.title, 'Open');
  });

  test('parses a follow-up report envelope', () {
    final report = FollowUpReport.fromJson({
      'generatedAt': '2026-08-16T00:00:00.000Z',
      'totals': {'total': 2, 'pending': 1, 'completed': 1, 'completionRateBps': 5000},
      'byType': [
        {'type': 'call', 'count': 2, 'completed': 1},
      ],
    });
    expect(report.totals.completed, 1);
    expect(report.byType.first.count, 2);
  });

  test('parses a sales report envelope', () {
    final report = SalesReport.fromJson({
      'generatedAt': '2026-08-16T00:00:00.000Z',
      'totals': {'deals': 2, 'revenueMinor': 75000, 'averageDealMinor': 37500, 'winRateBps': 6667},
      'byMonth': [
        {'month': '2026-08', 'deals': 2, 'revenueMinor': 75000},
      ],
    });
    expect(report.totals.deals, 2);
    expect(report.byMonth.first.month, '2026-08');
  });
}
