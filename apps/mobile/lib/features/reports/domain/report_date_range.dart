/// How a report endpoint reads `from` / `to` (mirrors web's
/// `apps/web/src/features/reports/dates.ts`):
/// - [instant]: ISO timestamps with `to` exclusive (leads, follow-ups,
///   quotations, sales, site visits, tracks).
/// - [ymd]: calendar dates with `to` inclusive (attendance, targets).
enum ReportDateMode { instant, ymd }

/// An inclusive calendar-date range picked on a report page.
class ReportDateRange {
  ReportDateRange({required DateTime from, required DateTime to})
    : from = DateTime(from.year, from.month, from.day),
      to = DateTime(to.year, to.month, to.day);

  final DateTime from;
  final DateTime to;

  static String ymd(DateTime value) {
    final m = value.month.toString().padLeft(2, '0');
    final d = value.day.toString().padLeft(2, '0');
    return '${value.year}-$m-$d';
  }

  String get label => from == to ? ymd(from) : '${ymd(from)} → ${ymd(to)}';

  /// The `from` / `to` query params for an endpoint read in [mode].
  Map<String, String> toQuery(ReportDateMode mode) {
    return switch (mode) {
      ReportDateMode.ymd => {'from': ymd(from), 'to': ymd(to)},
      ReportDateMode.instant => {
        'from': from.toUtc().toIso8601String(),
        'to': DateTime(to.year, to.month, to.day + 1).toUtc().toIso8601String(),
      },
    };
  }

  @override
  bool operator ==(Object other) =>
      other is ReportDateRange && other.from == from && other.to == to;

  @override
  int get hashCode => Object.hash(from, to);
}

/// Query params for an optional range; empty when [range] is null (all time).
Map<String, String> reportRangeQuery(ReportDateRange? range, ReportDateMode mode) {
  return range?.toQuery(mode) ?? const {};
}
