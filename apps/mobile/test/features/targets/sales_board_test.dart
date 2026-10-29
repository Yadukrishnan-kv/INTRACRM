import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/targets/domain/sales_board.dart';

void main() {
  group('formatBoardValue', () {
    test('shortens minor currency to the Indian lakh/crore scale', () {
      expect(formatBoardValue(15000000, money: true), '₹1.5L');
      expect(formatBoardValue(9000000, money: true), '₹90K');
      expect(formatBoardValue(650000, money: true), '₹6.5K');
      expect(formatBoardValue(185000000, money: true), '₹18.5L');
      expect(formatBoardValue(1200000000, money: true), '₹1.2Cr');
      expect(formatBoardValue(45000, money: true), '₹450');
    });

    test('drops a trailing .0 but keeps a real decimal at every scale', () {
      expect(formatBoardValue(20000000, money: true), '₹2L');
      expect(formatBoardValue(150000000, money: true), '₹15L');
      expect(formatBoardValue(1250000000, money: true), '₹1.3Cr');
      // 18.5L vs 19L is 50,000 rupees; the decimal has to survive.
      expect(formatBoardValue(185000000, money: true), '₹18.5L');
    });

    test('leaves a count alone', () {
      expect(formatBoardValue(18, money: false), '18');
      expect(formatBoardValue(18.5, money: false), '18.5');
    });
  });

  group('formatBoardDelta', () {
    test('signs the forecast gap in both directions', () {
      expect(formatBoardDelta(1000000, money: true), '+₹10K');
      expect(formatBoardDelta(-1000000, money: true), '-₹10K');
      expect(formatBoardDelta(0, money: true), '₹0');
    });
  });

  test('formatBps renders whole percents and a missing value', () {
    expect(formatBps(6000), '60%');
    expect(formatBps(10000), '100%');
    expect(formatBps(null), '—');
  });

  group('SalesBoard', () {
    final json = {
      'generatedAt': '2026-09-21T00:00:00.000Z',
      'timeZone': 'Asia/Kolkata',
      'today': '2026-09-21',
      'period': {
        'code': 'this_month',
        'title': 'This Month',
        'start': '2026-09-01',
        'end': '2026-09-30',
        'label': 'Sep 2026',
      },
      'periods': [
        {'code': 'this_month', 'title': 'This Month'},
        {'code': 'last_month', 'title': 'Last Month'},
      ],
      'scopes': [
        {'code': 'tenant', 'title': 'Company'},
      ],
      'scope': 'tenant',
      'metric': {'code': 'revenue', 'name': 'Revenue', 'unit': 'minor_currency'},
      'me': {
        'membershipId': 'm1',
        'name': 'Ravinder Jain',
        'targetValue': 15000000,
        'achievedValue': 9000000,
        'remaining': 6000000,
        'dailyAverage': 650000,
        'achievementBps': 6000,
        'daysRemaining': 9,
        'forecastValue': 14000000,
        'forecastDelta': 1000000,
        'rank': 17,
        'rankOf': 40,
        'onTrack': true,
        'pace': {
          'status': 'on_track',
          'title': 'ON TRACK',
          'detail': 'You are on track and meeting your target.',
        },
      },
      'overall': {
        'name': 'Company',
        'targetValue': 35000000,
        'achievedValue': 18000000,
        'dailyAverage': 900000,
        'achievementBps': 5142,
        'pace': {'status': 'trailing', 'title': 'TRAILING', 'detail': 'Behind pace.'},
      },
      'standings': [
        {
          'membershipId': 'm1',
          'name': 'Ravinder Jain',
          'designation': 'Super Admin',
          'rank': 1,
          'targetValue': 75000000,
          'achievedValue': 50000000,
          'achievementBps': 6667,
          'onTrack': true,
        },
      ],
      'podium': [
        {'membershipId': 'm2', 'name': 'Aman Shaikh', 'rank': 2, 'achievedValue': 30000000},
        {'membershipId': 'm1', 'name': 'Ravinder Jain', 'rank': 1, 'achievedValue': 50000000},
      ],
      'insights': [
        {'date': '2026-09-20', 'value': 100000, 'cumulative': 100000, 'runningAverage': 100000},
        {'date': '2026-09-21', 'value': 50000, 'cumulative': 150000, 'runningAverage': 75000},
      ],
      'suggestions': [
        {'code': 'raise_daily_average', 'title': 'Lift it', 'detail': 'Move from 6.5K to 7K.'},
      ],
    };

    test('parses the whole envelope', () {
      final board = SalesBoard.fromJson(json);
      expect(board.today, '2026-09-21');
      expect(board.period.label, 'Sep 2026');
      expect(board.periods, hasLength(2));
      expect(board.isMoney, isTrue);
      expect(board.standings.single.designation, 'Super Admin');
      expect(board.podium.first.name, 'Aman Shaikh');
      expect(board.insights, hasLength(2));
      expect(board.suggestions.single.code, 'raise_daily_average');
    });

    test('the My Target toggle swaps which card is shown', () {
      final board = SalesBoard.fromJson(json);
      expect(board.hasPersonalCard, isTrue);
      expect(board.card(mine: true).name, 'Ravinder Jain');
      expect(board.card(mine: false).name, 'Company');
    });

    test('falls back to the roll-up when the viewer has no card', () {
      final board = SalesBoard.fromJson({...json}..remove('me'));
      expect(board.hasPersonalCard, isFalse);
      expect(board.card(mine: true).name, 'Company');
    });

    test('reads the gauge figures off the personal card', () {
      final card = SalesBoard.fromJson(json).card(mine: true);
      expect(card.percentLabel, '60%');
      expect(card.fraction, closeTo(0.6, 0.0001));
      expect(card.rankLabel, '#17');
      expect(card.pace.onTrack, isTrue);
      expect(card.forecastDelta, 1000000);
    });

    test('clamps the gauge at full for an over-achiever', () {
      final card = SalesBoardCard.fromJson({
        'name': 'Over',
        'targetValue': 100,
        'achievedValue': 250,
        'achievementBps': 25000,
        'pace': {'status': 'on_track', 'title': 'ON TRACK', 'detail': ''},
      });
      expect(card.fraction, 1.0);
      expect(card.percentLabel, '250%');
    });

    test('survives an empty payload rather than throwing', () {
      final board = SalesBoard.fromJson(const {});
      expect(board.standings, isEmpty);
      expect(board.overall.targetValue, 0);
      expect(board.card(mine: true).rankLabel, '—');
    });
  });

  test('an insight row labels its day without the year', () {
    final row = SalesBoardInsight.fromJson({
      'date': '2026-09-07',
      'value': 1,
      'cumulative': 1,
      'runningAverage': 1,
    });
    expect(row.dayLabel, '07 Sep');
  });
}
