import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/incentives/domain/incentive.dart';

void main() {
  test('formats money in the Indian short form and percents from bps', () {
    expect(formatIncentiveMoney(850000), '₹8.5K');
    expect(formatIncentiveMoney(180000000), '₹18L');
    expect(formatIncentiveBps(5100), '51%');
    expect(formatIncentiveBps(null), '—');
  });

  group('IncentiveSlab', () {
    test('labels a closed band and an open top band', () {
      final closed = IncentiveSlab.fromJson({
        'id': 's1',
        'fromBps': 8000,
        'toBps': 10000,
        'payoutKind': 'percent',
        'rateBps': 200,
      });
      final open = IncentiveSlab.fromJson({
        'id': 's3',
        'fromBps': 12000,
        'payoutKind': 'percent',
        'rateBps': 400,
      });
      expect(closed.bandLabel, '80% – 100%');
      expect(open.bandLabel, '120%+');
    });

    test('describes each payout kind', () {
      expect(
        IncentiveSlab.fromJson({
          'id': 'a',
          'fromBps': 0,
          'payoutKind': 'percent',
          'rateBps': 300,
        }).payoutLabel,
        '3.00%',
      );
      expect(
        IncentiveSlab.fromJson({
          'id': 'b',
          'fromBps': 0,
          'payoutKind': 'flat',
          'amount': 500000,
        }).payoutLabel,
        '₹5K',
      );
      expect(
        IncentiveSlab.fromJson({
          'id': 'c',
          'fromBps': 0,
          'payoutKind': 'per_unit',
          'perUnitAmount': 125000,
        }).payoutLabel,
        '₹1.3K / unit',
      );
    });

    test('appends a band bonus to whichever kind it is', () {
      final slab = IncentiveSlab.fromJson({
        'id': 'd',
        'fromBps': 10000,
        'payoutKind': 'percent',
        'rateBps': 300,
        'bonusAmount': 500000,
      });
      expect(slab.payoutLabel, '3.00% + ₹5K');
    });
  });

  group('IncentivePlan', () {
    test('parses a plan with its slabs and coverage issues', () {
      final plan = IncentivePlan.fromJson({
        'id': 'p1',
        'name': 'FY27 sales incentive',
        'metricCode': 'revenue',
        'metricName': 'Revenue',
        'periodType': 'monthly',
        'basis': 'revenue',
        'status': 'active',
        'holdBps': 2500,
        'effectiveFrom': '2026-04-01',
        'slabs': [
          {'id': 's1', 'fromBps': 8000, 'toBps': 10000, 'payoutKind': 'percent', 'rateBps': 200},
        ],
        'coverageIssues': ['Attainment 0–8000 bps is not covered by any slab.'],
        'version': 3,
      });
      expect(plan.isActive, isTrue);
      expect(plan.hasIssues, isTrue);
      expect(plan.slabs.single.bandLabel, '80% – 100%');
      expect(plan.holdBps, 2500);
      expect(plan.version, 3);
    });

    test('a sound ladder reports no issues', () {
      final plan = IncentivePlan.fromJson({
        'id': 'p2',
        'name': 'Clean',
        'metricCode': 'revenue',
        'metricName': 'Revenue',
        'periodType': 'monthly',
        'basis': 'revenue',
        'status': 'draft',
        'effectiveFrom': '2026-04-01',
        'coverageIssues': <String>[],
      });
      expect(plan.hasIssues, isFalse);
      expect(plan.isActive, isFalse);
    });
  });

  group('IncentiveTotals', () {
    test('renders the target-achievement card as achieved over target', () {
      final totals = IncentiveTotals.fromJson({
        'achievedValue': 180000000,
        'targetValue': 350000000,
        'completionBps': 5143,
      });
      expect(totals.achievementLabel, '₹18L / ₹35L');
      expect(formatIncentiveBps(totals.completionBps), '51%');
    });
  });

  group('IncentiveMemberRow', () {
    test('derives attainment from the row totals', () {
      final row = IncentiveMemberRow.fromJson({
        'membershipName': 'Ravinder Jain',
        'targetValue': 200,
        'achievedValue': 150,
        'earnedAmount': 850000,
        'wonOrders': 18,
      });
      expect(row.attainmentBps, 7500);
      expect(row.wonOrders, 18);
    });

    test('has no attainment against a zero target', () {
      final row = IncentiveMemberRow.fromJson({
        'membershipName': 'No quota',
        'targetValue': 0,
        'achievedValue': 500,
        'earnedAmount': 0,
      });
      expect(row.attainmentBps, isNull);
    });
  });

  group('IncentiveReport', () {
    test('parses the report envelope', () {
      final report = IncentiveReport.fromJson({
        'generatedAt': '2026-09-21T00:00:00.000Z',
        'totals': {
          'count': 2,
          'targetValue': 350000000,
          'achievedValue': 180000000,
          'earnedAmount': 850000,
          'wonOrders': 18,
          'completionBps': 5143,
        },
        'byStatus': [
          {'status': 'approved', 'count': 1, 'earnedAmount': 500000},
        ],
        'byMember': [
          {
            'membershipId': 'm1',
            'membershipName': 'Ravinder Jain',
            'targetValue': 200000000,
            'achievedValue': 120000000,
            'earnedAmount': 600000,
            'wonOrders': 12,
          },
        ],
        'items': [
          {
            'id': 'po1',
            'planId': 'p1',
            'planName': 'FY27',
            'periodStart': '2026-09-01',
            'periodEnd': '2026-09-30',
            'targetValue': 200000000,
            'achievedValue': 120000000,
            'attainmentBps': 6000,
            'earnedAmount': 600000,
            'payableAmount': 450000,
            'holdAmount': 150000,
            'status': 'approved',
          },
        ],
      });
      expect(report.isEmpty, isFalse);
      expect(report.totals.wonOrders, 18);
      expect(report.totals.achievementLabel, '₹18L / ₹35L');
      expect(report.byMember.single.attainmentBps, 6000);
      expect(report.items.single.isApproved, isTrue);
      expect(report.items.single.holdAmount, 150000);
    });

    test('an empty report reads as empty rather than throwing', () {
      final report = IncentiveReport.fromJson(const {});
      expect(report.isEmpty, isTrue);
      expect(report.totals.earnedAmount, 0);
      expect(report.totals.completionBps, isNull);
    });
  });

  test('MyIncentive lifts totals out of the nested summary', () {
    final mine = MyIncentive.fromJson({
      'items': [
        {
          'id': 'po1',
          'planId': 'p1',
          'planName': 'FY27',
          'periodStart': '2026-09-01',
          'periodEnd': '2026-09-30',
          'targetValue': 100,
          'achievedValue': 60,
          'earnedAmount': 850000,
          'status': 'draft',
        },
      ],
      'summary': {
        'totals': {'earnedAmount': 850000, 'wonOrders': 18},
      },
    });
    expect(mine.totals.earnedAmount, 850000);
    expect(mine.items.single.isDraft, isTrue);
  });
}
