import 'package:flutter/material.dart';

import '../../../design_system/tokens/app_spacing.dart';

class ReportMetricCard extends StatelessWidget {
  const ReportMetricCard({super.key, required this.label, this.value, this.valueLabel});

  final String label;
  final int? value;
  final String? valueLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                valueLabel ?? '${value ?? 0}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(label),
            ],
          ),
        ),
      ),
    );
  }
}

String reportPercent(int? bps) {
  if (bps == null) {
    return '—';
  }
  return '${(bps / 100).toStringAsFixed(0)}%';
}
