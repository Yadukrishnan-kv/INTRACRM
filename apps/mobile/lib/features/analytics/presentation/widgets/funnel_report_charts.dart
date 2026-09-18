import 'package:flutter/material.dart';

import '../../../../design_system/tokens/app_spacing.dart';
import '../../../dashboard/domain/dashboard.dart';
import '../../domain/funnel_report.dart';

class FunnelStageColors {
  static const lead = Color(0xFF2563EB);
  static const qualified = Color(0xFF0D9488);
  static const quotation = Color(0xFFD97706);
  static const negotiation = Color(0xFFEA580C);
  static const won = Color(0xFF16A34A);

  static Color of(String code) {
    return switch (code) {
      'lead' => lead,
      'qualified' => qualified,
      'quotation' => quotation,
      'negotiation' => negotiation,
      'won' => won,
      _ => lead,
    };
  }
}

class FunnelPyramidChart extends StatelessWidget {
  const FunnelPyramidChart({super.key, required this.stages});

  final List<FunnelReportStage> stages;

  @override
  Widget build(BuildContext context) {
    if (stages.isEmpty) {
      return const SizedBox.shrink();
    }
    final max = stages.fold<int>(1, (current, stage) => stage.reachedCount > current ? stage.reachedCount : current);
    return Column(
      children: [
        for (var index = 0; index < stages.length; index++) ...[
          if (index > 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(
                stages[index].conversionLabel,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: FunnelStageColors.of(stages[index].code),
                ),
              ),
            ),
          _TrapezoidBand(
            label: stages[index].label,
            value: stages[index].reachedCount,
            color: FunnelStageColors.of(stages[index].code),
            topInset: index / stages.length * 0.28,
            bottomInset: (index + 1) / stages.length * 0.28,
            fraction: stages[index].reachedCount / max,
          ),
        ],
      ],
    );
  }
}

class _TrapezoidBand extends StatelessWidget {
  const _TrapezoidBand({
    required this.label,
    required this.value,
    required this.color,
    required this.topInset,
    required this.bottomInset,
    required this.fraction,
  });

  final String label;
  final int value;
  final Color color;
  final double topInset;
  final double bottomInset;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: Theme.of(context).textTheme.titleSmall)),
            Text('$value', style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 28,
          width: double.infinity,
          child: CustomPaint(
            painter: _TrapezoidPainter(
              color: color,
              topInset: topInset,
              bottomInset: bottomInset,
              fraction: fraction.clamp(0.12, 1),
            ),
          ),
        ),
      ],
    );
  }
}

class _TrapezoidPainter extends CustomPainter {
  _TrapezoidPainter({
    required this.color,
    required this.topInset,
    required this.bottomInset,
    required this.fraction,
  });

  final Color color;
  final double topInset;
  final double bottomInset;
  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    final insetTop = size.width * topInset * (1.2 - fraction);
    final insetBottom = size.width * bottomInset * (1.2 - fraction);
    final path = Path()
      ..moveTo(insetTop, 0)
      ..lineTo(size.width - insetTop, 0)
      ..lineTo(size.width - insetBottom, size.height)
      ..lineTo(insetBottom, size.height)
      ..close();
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.fill,
    );
  }

  @override
  bool shouldRepaint(covariant _TrapezoidPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.topInset != topInset ||
        oldDelegate.bottomInset != bottomInset ||
        oldDelegate.fraction != fraction;
  }
}

class FunnelConversionChart extends StatelessWidget {
  const FunnelConversionChart({super.key, required this.slices});

  final List<DashboardMixSlice> slices;

  @override
  Widget build(BuildContext context) {
    if (slices.isEmpty) {
      return const SizedBox(height: 96, child: Center(child: Text('No conversion data')));
    }
    return Column(
      children: [
        for (final slice in slices) ...[
          Row(
            children: [
              Expanded(child: Text(slice.label)),
              Text('${(slice.value / 100).toStringAsFixed(0)}%'),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: (slice.value / 10000).clamp(0, 1),
              minHeight: 10,
              color: FunnelStageColors.of(_codeForLabel(slice.code)),
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  String _codeForLabel(String code) {
    if (code.contains('won')) {
      return 'won';
    }
    if (code.contains('negotiation')) {
      return 'negotiation';
    }
    if (code.contains('quotation')) {
      return 'quotation';
    }
    if (code.contains('qualified')) {
      return 'qualified';
    }
    return 'lead';
  }
}

class FunnelTrendChart extends StatelessWidget {
  const FunnelTrendChart({super.key, required this.points, required this.stages});

  final List<FunnelTrendPoint> points;
  final List<FunnelReportStage> stages;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty || stages.isEmpty) {
      return const SizedBox(height: 96, child: Center(child: Text('No trend data')));
    }
    var max = 1;
    for (final point in points) {
      for (final stage in stages) {
        final value = point.values[stage.code] ?? 0;
        if (value > max) {
          max = value;
        }
      }
    }
    return Column(
      children: [
        SizedBox(
          height: 160,
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
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              for (final stage in stages)
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 0.5),
                                    child: FractionallySizedBox(
                                      heightFactor: ((point.values[stage.code] ?? 0) / max).clamp(0.04, 1),
                                      widthFactor: 1,
                                      alignment: Alignment.bottomCenter,
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          color: FunnelStageColors.of(stage.code),
                                          borderRadius: BorderRadius.circular(2),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
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
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final stage in stages)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: FunnelStageColors.of(stage.code),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(stage.label, style: Theme.of(context).textTheme.labelSmall),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class FunnelCurrentChart extends StatelessWidget {
  const FunnelCurrentChart({super.key, required this.slices});

  final List<DashboardMixSlice> slices;

  @override
  Widget build(BuildContext context) {
    final max = slices.fold<int>(1, (current, slice) => slice.value > current ? slice.value : current);
    if (slices.isEmpty) {
      return const SizedBox.shrink();
    }
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final slice in slices)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  children: [
                    Text('${slice.value}', style: Theme.of(context).textTheme.labelMedium),
                    Expanded(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: FractionallySizedBox(
                          heightFactor: (slice.value / max).clamp(0.06, 1),
                          widthFactor: 1,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: FunnelStageColors.of(slice.code),
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(slice.label, style: Theme.of(context).textTheme.labelSmall, textAlign: TextAlign.center),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
