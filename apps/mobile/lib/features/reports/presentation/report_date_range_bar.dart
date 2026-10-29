import 'package:flutter/material.dart';

import '../../../l10n/app_strings.dart';
import '../domain/report_date_range.dart';

/// Shared date-range filter for report pages. Null [range] means all time.
class ReportDateRangeBar extends StatelessWidget {
  const ReportDateRangeBar({
    super.key,
    required this.range,
    required this.onChanged,
  });

  final ReportDateRange? range;
  final ValueChanged<ReportDateRange?> onChanged;

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final current = range;
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year + 1, 12, 31),
      initialDateRange: current == null
          ? DateTimeRange(start: DateTime(now.year, now.month), end: now)
          : DateTimeRange(start: current.from, end: current.to),
    );
    if (picked != null) {
      onChanged(ReportDateRange(from: picked.start, to: picked.end));
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = range;
    return Row(
      children: [
        Expanded(
          child: Align(
            alignment: Alignment.centerLeft,
            child: ActionChip(
              avatar: const Icon(Icons.date_range, size: 18),
              label: Text(current?.label ?? AppStrings.allTime),
              tooltip: AppStrings.dateRange,
              onPressed: () => _pick(context),
            ),
          ),
        ),
        if (current != null)
          IconButton(
            tooltip: AppStrings.clearDateRange,
            onPressed: () => onChanged(null),
            icon: const Icon(Icons.close),
          ),
      ],
    );
  }
}
