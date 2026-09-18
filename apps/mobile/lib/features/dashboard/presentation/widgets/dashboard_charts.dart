import 'package:flutter/material.dart';

import '../../../../design_system/tokens/app_spacing.dart';
import '../../domain/dashboard.dart';

class DashboardBarChart extends StatelessWidget {
  const DashboardBarChart({super.key, required this.points, this.color});

  final List<DashboardSeriesPoint> points;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final barColor = color ?? Theme.of(context).colorScheme.primary;
    final max = points.fold<int>(0, (current, point) => point.value > current ? point.value : current);
    if (points.isEmpty) {
      return const SizedBox(height: 96, child: Center(child: Text('No chart data')));
    }
    return SizedBox(
      height: 128,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final point in points)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  children: [
                    Expanded(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: FractionallySizedBox(
                          heightFactor: max <= 0 ? 0.04 : (point.value / max).clamp(0.04, 1),
                          widthFactor: 1,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: barColor,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(point.label, style: Theme.of(context).textTheme.labelSmall),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class DashboardMixChart extends StatelessWidget {
  const DashboardMixChart({super.key, required this.slices});

  final List<DashboardMixSlice> slices;

  @override
  Widget build(BuildContext context) {
    final max = slices.fold<int>(0, (current, slice) => slice.value > current ? slice.value : current);
    if (slices.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      children: [
        for (final slice in slices) ...[
          Row(
            children: [
              Expanded(child: Text(slice.label)),
              Text('${slice.value}'),
            ],
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(
            value: max <= 0 ? 0 : slice.value / max,
            minHeight: 8,
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}
