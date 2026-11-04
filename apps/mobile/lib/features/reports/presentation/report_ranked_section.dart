import 'package:flutter/material.dart';

import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_radii.dart';
import '../../../design_system/tokens/app_spacing.dart';

/// One row in a [ReportRankedSection]. [payload] is an optional opaque value
/// (e.g. a `LeadListFilter`) handed back to [ReportRankedSection.onItemTap]
/// for drill-down navigation; rows without one aren't tappable.
class RankedItem {
  const RankedItem({
    required this.label,
    required this.count,
    this.valueLabel,
    this.subtitle,
    this.payload,
  });

  final String label;
  final int count;
  final String? valueLabel;
  final String? subtitle;
  final Object? payload;
}

/// Maps [rows] to [RankedItem]s sorted by count descending, so the biggest
/// contributor always leads — shared by every report screen's breakdown
/// sections (By source, By status, By staff, ...).
List<RankedItem> rankedBy<R>(
  List<R> rows, {
  required String Function(R row) label,
  required int Function(R row) count,
  String Function(R row)? valueLabel,
  String Function(R row)? subtitle,
  Object? Function(R row)? payload,
}) {
  final items = [
    for (final row in rows)
      RankedItem(
        label: label(row),
        count: count(row),
        valueLabel: valueLabel?.call(row),
        subtitle: subtitle?.call(row),
        payload: payload?.call(row),
      ),
  ];
  items.sort((a, b) => b.count.compareTo(a.count));
  return items;
}

/// A collapsible, ranked, bar-charted report section shared by every report
/// screen. Rows are pre-sorted by [rankedBy] so the top contributor always
/// leads; beyond [collapsedLimit] rows the section collapses behind a
/// "Show all" toggle to keep long lists (many sources, cities, staff...)
/// short and fast to scroll initially.
class ReportRankedSection extends StatefulWidget {
  const ReportRankedSection({
    super.key,
    required this.title,
    required this.icon,
    required this.items,
    this.onItemTap,
    this.collapsedLimit = 5,
    this.emptyLabel,
  });

  final String title;
  final IconData icon;
  final List<RankedItem> items;
  final void Function(Object payload)? onItemTap;
  final int collapsedLimit;

  /// When set, the section still renders (with this message) even if
  /// [items] is empty; otherwise an empty section renders nothing.
  final String? emptyLabel;

  @override
  State<ReportRankedSection> createState() => _ReportRankedSectionState();
}

class _ReportRankedSectionState extends State<ReportRankedSection> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    if (items.isEmpty) {
      final emptyLabel = widget.emptyLabel;
      if (emptyLabel == null) {
        return const SizedBox.shrink();
      }
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: SectionCard(child: Text(emptyLabel, style: TextStyle(color: context.palette.muted))),
      );
    }
    final maxCount = items.map((item) => item.count).reduce((a, b) => a > b ? a : b);
    final hasMore = items.length > widget.collapsedLimit;
    final visible = _expanded ? items : items.take(widget.collapsedLimit).toList();
    final total = items.fold<int>(0, (sum, item) => sum + item.count);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: SectionCard(
        padding: const EdgeInsets.fromLTRB(AppSpacing.sm, AppSpacing.sm, AppSpacing.sm, AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 15,
                    backgroundColor: context.palette.tealSoft,
                    child: Icon(widget.icon, color: AppColors.teal, size: 16),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      widget.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  StatusBadge(label: '$total'),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            for (var i = 0; i < visible.length; i++)
              _RankedRow(
                rank: i + 1,
                item: visible[i],
                maxCount: maxCount,
                onTap: widget.onItemTap == null || visible[i].payload == null
                    ? null
                    : () => widget.onItemTap!(visible[i].payload!),
              ),
            if (hasMore)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => setState(() => _expanded = !_expanded),
                  child: Text(_expanded ? 'Show less' : 'Show all (${items.length})'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RankedRow extends StatelessWidget {
  const _RankedRow({required this.rank, required this.item, required this.maxCount, this.onTap});

  final int rank;
  final RankedItem item;
  final int maxCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fraction = maxCount == 0 ? 0.0 : item.count / maxCount;
    final rankColor = rank <= 3 ? AppColors.teal : context.palette.muted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs, horizontal: AppSpacing.xxs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 22,
                  child: Text('$rank', style: TextStyle(fontWeight: FontWeight.w700, color: rankColor)),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (item.subtitle != null || item.valueLabel != null)
                        Text(
                          [
                            if (item.valueLabel != null) item.valueLabel!,
                            if (item.subtitle != null) item.subtitle!,
                          ].join(' · '),
                          style: TextStyle(fontSize: 12, color: context.palette.muted),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Text('${item.count}', style: const TextStyle(fontWeight: FontWeight.w700)),
                if (onTap != null) ...[
                  const SizedBox(width: AppSpacing.xxs),
                  Icon(Icons.chevron_right, size: 18, color: context.palette.muted),
                ],
              ],
            ),
            const SizedBox(height: AppSpacing.xxs),
            Padding(
              padding: const EdgeInsets.only(left: 22),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                child: LinearProgressIndicator(
                  value: fraction,
                  minHeight: 4,
                  backgroundColor: context.palette.tealSoft,
                  valueColor: AlwaysStoppedAnimation(
                    rank <= 3 ? AppColors.teal : AppColors.teal.withValues(alpha: 0.45),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
