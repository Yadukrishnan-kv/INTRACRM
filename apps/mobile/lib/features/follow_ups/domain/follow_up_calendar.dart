/// The month grid behind the Follow-Up Reminders calendar.
///
/// The API returns exactly 42 cells — six weeks, Sunday first — so the grid
/// never changes height between months and the client does no date maths of
/// its own beyond reading the labels.
library;

const followUpWeekdayLabels = <String>['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const _monthNames = <String>[
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/// `2026-09` → `September`, with the year returned separately by [yearOf].
String monthNameOf(String month) {
  final index = int.tryParse(month.length >= 7 ? month.substring(5, 7) : '') ?? 0;
  return index >= 1 && index <= 12 ? _monthNames[index - 1] : month;
}

String yearOf(String month) => month.length >= 4 ? month.substring(0, 4) : '';

/// Steps a `YYYY-MM` key by whole months, rolling the year over.
String shiftMonth(String month, int delta) {
  final year = int.tryParse(yearOf(month)) ?? 1970;
  final index = int.tryParse(month.length >= 7 ? month.substring(5, 7) : '') ?? 1;
  final zeroBased = (year * 12 + (index - 1)) + delta;
  final newYear = zeroBased ~/ 12;
  final newMonth = zeroBased % 12 + 1;
  return '${newYear.toString().padLeft(4, '0')}-${newMonth.toString().padLeft(2, '0')}';
}

/// Which band colours a day's badge; mirrors the server's `DayBand`.
enum FollowUpDayBand { overdue, due, completed, cancelled }

FollowUpDayBand? bandFromCode(String? code) {
  return switch (code) {
    'overdue' => FollowUpDayBand.overdue,
    'due' => FollowUpDayBand.due,
    'completed' => FollowUpDayBand.completed,
    'cancelled' => FollowUpDayBand.cancelled,
    _ => null,
  };
}

class FollowUpCalendarDay {
  const FollowUpCalendarDay({
    required this.date,
    required this.inMonth,
    required this.isToday,
    required this.total,
    this.overdue = 0,
    this.due = 0,
    this.completed = 0,
    this.cancelled = 0,
    this.band,
  });

  final String date;
  final bool inMonth;
  final bool isToday;
  final int total;
  final int overdue;
  final int due;
  final int completed;
  final int cancelled;
  final FollowUpDayBand? band;

  /// `1`–`31`, the number painted in the cell.
  String get dayLabel =>
      date.length >= 10 ? int.parse(date.substring(8, 10)).toString() : date;

  factory FollowUpCalendarDay.fromJson(Map<String, dynamic> json) {
    return FollowUpCalendarDay(
      date: json['date'] as String? ?? '',
      inMonth: json['inMonth'] as bool? ?? false,
      isToday: json['isToday'] as bool? ?? false,
      total: json['total'] as int? ?? 0,
      overdue: json['overdue'] as int? ?? 0,
      due: json['due'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      cancelled: json['cancelled'] as int? ?? 0,
      band: bandFromCode(json['band'] as String?),
    );
  }
}

class FollowUpCalendarTotals {
  const FollowUpCalendarTotals({
    this.total = 0,
    this.overdue = 0,
    this.due = 0,
    this.completed = 0,
    this.cancelled = 0,
  });

  final int total;
  final int overdue;
  final int due;
  final int completed;
  final int cancelled;

  factory FollowUpCalendarTotals.fromJson(Map<String, dynamic> json) {
    return FollowUpCalendarTotals(
      total: json['total'] as int? ?? 0,
      overdue: json['overdue'] as int? ?? 0,
      due: json['due'] as int? ?? 0,
      completed: json['completed'] as int? ?? 0,
      cancelled: json['cancelled'] as int? ?? 0,
    );
  }
}

class FollowUpCalendarMonth {
  const FollowUpCalendarMonth({
    required this.month,
    required this.timeZone,
    required this.today,
    required this.monthStart,
    required this.monthEnd,
    this.days = const [],
    this.totals = const FollowUpCalendarTotals(),
  });

  final String month;
  final String timeZone;
  final String today;
  final String monthStart;
  final String monthEnd;
  final List<FollowUpCalendarDay> days;
  final FollowUpCalendarTotals totals;

  String get title => '${monthNameOf(month)} ${yearOf(month)}';

  /// The 42 cells split into six rows of seven, ready to lay out.
  List<List<FollowUpCalendarDay>> get weeks {
    final out = <List<FollowUpCalendarDay>>[];
    for (var index = 0; index < days.length; index += 7) {
      out.add(days.sublist(index, (index + 7).clamp(0, days.length)));
    }
    return out;
  }

  /// Today when it falls inside this month, otherwise the first — so opening
  /// a past or future month lands on a day that exists in it.
  String get defaultSelectedDay {
    if (today.compareTo(monthStart) >= 0 && today.compareTo(monthEnd) <= 0) {
      return today;
    }
    return monthStart;
  }

  FollowUpCalendarDay? dayFor(String date) {
    for (final day in days) {
      if (day.date == date) {
        return day;
      }
    }
    return null;
  }

  factory FollowUpCalendarMonth.fromJson(Map<String, dynamic> json) {
    final days = json['days'] as List<dynamic>? ?? const [];
    return FollowUpCalendarMonth(
      month: json['month'] as String? ?? '',
      timeZone: json['timeZone'] as String? ?? 'Asia/Kolkata',
      today: json['today'] as String? ?? '',
      monthStart: json['monthStart'] as String? ?? '',
      monthEnd: json['monthEnd'] as String? ?? '',
      days: [
        for (final day in days)
          if (day is Map<String, dynamic>) FollowUpCalendarDay.fromJson(day),
      ],
      totals: FollowUpCalendarTotals.fromJson(
        json['totals'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}
