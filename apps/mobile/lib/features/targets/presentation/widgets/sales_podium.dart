import 'package:flutter/material.dart';

import '../../../../design_system/components/premium_ui.dart';
import '../../../../design_system/tokens/app_colors.dart';
import '../../../../design_system/tokens/app_palette.dart';
import '../../domain/sales_board.dart';

/// The top-three podium: second, first, third, left to right, with the
/// winner's block tallest. The API already returns [SalesBoard.podium] in
/// that draw order.
class SalesPodium extends StatelessWidget {
  const SalesPodium({
    super.key,
    required this.entries,
    required this.money,
    this.onTap,
  });

  final List<SalesBoardStanding> entries;
  final bool money;
  final void Function(SalesBoardStanding entry)? onTap;

  static const _heights = <int, double>{1: 96, 2: 72, 3: 58};

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final entry in entries)
          Expanded(
            child: _Block(
              entry: entry,
              money: money,
              height: _heights[entry.rank] ?? 52,
              onTap: onTap == null ? null : () => onTap!(entry),
            ),
          ),
      ],
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({
    required this.entry,
    required this.money,
    required this.height,
    this.onTap,
  });

  final SalesBoardStanding entry;
  final bool money;
  final double height;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final first = entry.rank == 1;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (first)
              const Icon(Icons.emoji_events, color: Color(0xFFD9A441), size: 26)
            else
              const SizedBox(height: 26),
            const SizedBox(height: 4),
            InitialsAvatar(name: entry.name, size: first ? 44 : 36),
            const SizedBox(height: 6),
            Text(
              entry.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            Text(
              formatBoardValue(entry.achievedValue, money: money),
              style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
            ),
            const SizedBox(height: 6),
            Container(
              height: height,
              decoration: BoxDecoration(
                color: first ? AppColors.teal : context.palette.tealSoft,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
              ),
              alignment: Alignment.center,
              child: Text(
                '${entry.rank}',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: first ? Colors.white : AppColors.teal,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
