import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../design_system/tokens/app_colors.dart';
import '../../../../design_system/tokens/app_palette.dart';

/// The half-circle achievement gauge on the Monthly Sales Target card.
///
/// A 240° arc opening downwards, so the two ends sit either side of the
/// baseline and the min/max labels tuck under them. Drawn here rather than
/// with [AppDonut] because that one is a full ring with no scale ends.
class SalesGauge extends StatelessWidget {
  const SalesGauge({
    super.key,
    required this.progress,
    required this.valueLabel,
    required this.caption,
    this.minLabel = '0',
    this.maxLabel,
    this.size = 180,
    this.onTrack = true,
  });

  /// 0–1. Values above 1 are clamped by the painter so the arc cannot wrap.
  final double progress;
  final String valueLabel;
  final String caption;
  final String minLabel;
  final String? maxLabel;
  final double size;
  final bool onTrack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sweepColor = onTrack ? AppColors.teal : AppColors.warning;
    return SizedBox(
      width: size,
      // The arc only occupies the upper ~72% of its square; the rest would be
      // dead space under the open ends.
      height: size * 0.78,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          CustomPaint(
            size: Size(size, size * 0.78),
            painter: _GaugePainter(
              progress: progress.clamp(0.0, 1.0),
              trackColor: context.palette.tealSoft,
              valueColor: sweepColor,
            ),
          ),
          Positioned(
            top: size * 0.30,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  valueLabel,
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                Text(
                  caption,
                  style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                ),
              ],
            ),
          ),
          Positioned(
            left: 0,
            bottom: 0,
            child: Text(
              minLabel,
              style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
            ),
          ),
          if (maxLabel != null)
            Positioned(
              right: 0,
              bottom: 0,
              child: Text(
                maxLabel!,
                style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({
    required this.progress,
    required this.trackColor,
    required this.valueColor,
  });

  final double progress;
  final Color trackColor;
  final Color valueColor;

  /// 240° of arc, centred on straight up: start at 150°, sweep clockwise.
  static const _startAngle = math.pi * 0.833;
  static const _sweepAngle = math.pi * 1.333;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.10;
    final diameter = size.width - stroke;
    final rect = Rect.fromLTWH(stroke / 2, stroke / 2, diameter, diameter);

    final track = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, _startAngle, _sweepAngle, false, track);

    if (progress > 0) {
      final value = Paint()
        ..color = valueColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, _startAngle, _sweepAngle * progress, false, value);
    }
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.valueColor != valueColor;
  }
}
