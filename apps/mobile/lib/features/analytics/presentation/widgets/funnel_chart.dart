import 'package:flutter/material.dart';

import '../../../../design_system/tokens/app_spacing.dart';
import '../../domain/analytics.dart';

class FunnelChart extends StatelessWidget {
  const FunnelChart({super.key, required this.funnel});

  final AnalyticsFunnel funnel;

  @override
  Widget build(BuildContext context) {
    final steps = funnel.steps;
    if (steps.isEmpty) {
      return const SizedBox.shrink();
    }
    final max = steps.fold<int>(1, (current, step) => step.value > current ? step.value : current);
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        for (var index = 0; index < steps.length; index++) ...[
          if (index > 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                steps[index].conversionLabel,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.primary),
              ),
            ),
          _FunnelBar(
            label: steps[index].label,
            value: steps[index].value,
            fraction: steps[index].value / max,
            dropOff: steps[index].dropOffCount,
          ),
        ],
      ],
    );
  }
}

class _FunnelBar extends StatelessWidget {
  const _FunnelBar({
    required this.label,
    required this.value,
    required this.fraction,
    this.dropOff,
  });

  final String label;
  final int value;
  final double fraction;
  final int? dropOff;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: Theme.of(context).textTheme.titleSmall)),
            Text('$value', style: Theme.of(context).textTheme.titleMedium),
            if (dropOff != null && dropOff! > 0)
              Padding(
                padding: const EdgeInsets.only(left: AppSpacing.xs),
                child: Text(
                  '−$dropOff',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(color: scheme.error),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            height: 18,
            child: Align(
              alignment: Alignment.center,
              child: FractionallySizedBox(
                widthFactor: fraction.clamp(0.08, 1),
                child: ColoredBox(color: scheme.primary),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
