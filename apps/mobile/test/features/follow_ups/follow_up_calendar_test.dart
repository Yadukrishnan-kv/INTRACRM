import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/follow_ups/domain/follow_up_calendar.dart';

Map<String, dynamic> day(String date, {bool inMonth = true, int total = 0, String? band}) {
  return {
    'date': date,
    'inMonth': inMonth,
    'isToday': date == '2026-09-21',
    'total': total,
    'overdue': band == 'overdue' ? total : 0,
    'due': band == 'due' ? total : 0,
    'completed': band == 'completed' ? total : 0,
    'cancelled': band == 'cancelled' ? total : 0,
    'band': band,
  };
}

/// A full 42-cell grid for September 2026, which opens on Sunday 2026-08-30.
List<Map<String, dynamic>> septemberGrid() {
  final days = <Map<String, dynamic>>[];
  for (final date in ['2026-08-30', '2026-08-31']) {
    days.add(day(date, inMonth: false));
  }
  for (var index = 1; index <= 30; index += 1) {
    days.add(day('2026-09-${index.toString().padLeft(2, '0')}'));
  }
  for (var index = 1; index <= 10; index += 1) {
    days.add(day('2026-10-${index.toString().padLeft(2, '0')}', inMonth: false));
  }
  return days;
}

void main() {
  group('month helpers', () {
    test('reads the month name and year off a YYYY-MM key', () {
      expect(monthNameOf('2026-09'), 'September');
      expect(monthNameOf('2026-01'), 'January');
      expect(yearOf('2026-09'), '2026');
    });

    test('falls back to the raw value for a malformed key', () {
      expect(monthNameOf('nope'), 'nope');
      expect(monthNameOf('2026-13'), '2026-13');
    });

    test('steps months and rolls the year over in both directions', () {
      expect(shiftMonth('2026-09', 1), '2026-10');
      expect(shiftMonth('2026-12', 1), '2027-01');
      expect(shiftMonth('2026-01', -1), '2025-12');
      expect(shiftMonth('2026-09', -12), '2025-09');
      expect(shiftMonth('2026-09', 0), '2026-09');
    });
  });

  test('bandFromCode maps the server codes and ignores the rest', () {
    expect(bandFromCode('overdue'), FollowUpDayBand.overdue);
    expect(bandFromCode('due'), FollowUpDayBand.due);
    expect(bandFromCode('completed'), FollowUpDayBand.completed);
    expect(bandFromCode('cancelled'), FollowUpDayBand.cancelled);
    expect(bandFromCode(null), isNull);
    expect(bandFromCode('something_else'), isNull);
  });

  group('FollowUpCalendarMonth', () {
    FollowUpCalendarMonth build({List<Map<String, dynamic>>? days, String today = '2026-09-21'}) {
      return FollowUpCalendarMonth.fromJson({
        'month': '2026-09',
        'timeZone': 'Asia/Kolkata',
        'today': today,
        'monthStart': '2026-09-01',
        'monthEnd': '2026-09-30',
        'days': days ?? septemberGrid(),
        'totals': {'total': 5, 'overdue': 2, 'due': 2, 'completed': 1, 'cancelled': 0},
      });
    }

    test('parses the grid and the totals', () {
      final month = build();
      expect(month.title, 'September 2026');
      expect(month.days, hasLength(42));
      expect(month.totals.total, 5);
      expect(month.totals.overdue, 2);
    });

    test('splits the grid into six rows of seven', () {
      final weeks = build().weeks;
      expect(weeks, hasLength(6));
      expect(weeks.every((week) => week.length == 7), isTrue);
      expect(weeks.first.first.date, '2026-08-30');
      expect(weeks.last.last.date, '2026-10-10');
    });

    test('selects today when it falls inside the month', () {
      expect(build().defaultSelectedDay, '2026-09-21');
    });

    test('selects the first when today is in another month', () {
      expect(build(today: '2026-11-04').defaultSelectedDay, '2026-09-01');
      expect(build(today: '2026-05-04').defaultSelectedDay, '2026-09-01');
    });

    test('finds a day by date and reports a miss', () {
      final month = build();
      expect(month.dayFor('2026-09-21')?.isToday, isTrue);
      expect(month.dayFor('2026-09-21')?.dayLabel, '21');
      expect(month.dayFor('1999-01-01'), isNull);
    });

    test('marks the leading and trailing cells as outside the month', () {
      final month = build();
      expect(month.dayFor('2026-08-30')?.inMonth, isFalse);
      expect(month.dayFor('2026-09-01')?.inMonth, isTrue);
      expect(month.dayFor('2026-10-10')?.inMonth, isFalse);
    });

    test('reads a day badge and its band', () {
      final month = build(
        days: [day('2026-09-14', total: 3, band: 'overdue')],
      );
      final cell = month.dayFor('2026-09-14');
      expect(cell?.total, 3);
      expect(cell?.overdue, 3);
      expect(cell?.band, FollowUpDayBand.overdue);
    });

    test('strips the leading zero from the cell label', () {
      final month = build(days: [day('2026-09-07')]);
      expect(month.dayFor('2026-09-07')?.dayLabel, '7');
    });

    test('survives an empty payload', () {
      final month = FollowUpCalendarMonth.fromJson(const {});
      expect(month.days, isEmpty);
      expect(month.weeks, isEmpty);
      expect(month.totals.total, 0);
    });
  });
}
