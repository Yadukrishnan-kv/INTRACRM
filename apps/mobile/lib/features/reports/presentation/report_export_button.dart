import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../l10n/app_strings.dart';
import '../data/report_export_api.dart';

final reportExportApiProvider = Provider<ReportExportApi>((ref) {
  return ReportExportApi(ref.watch(apiClientProvider));
});

class ReportExportButton extends ConsumerStatefulWidget {
  const ReportExportButton({super.key, required this.dataset, this.periodType});

  final String dataset;
  final String? periodType;

  @override
  ConsumerState<ReportExportButton> createState() => _ReportExportButtonState();
}

class _ReportExportButtonState extends ConsumerState<ReportExportButton> {
  var _busy = false;

  Future<void> _export(String format) async {
    setState(() => _busy = true);
    final result = await ref.read(reportExportApiProvider).download(
      dataset: widget.dataset,
      format: format,
      periodType: widget.periodType,
    );
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    late final List<int> bytes;
    switch (result) {
      case Success(:final value):
        bytes = value;
      case Err(:final failure):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message)),
        );
        return;
    }
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/${widget.dataset}-report.$format');
    await file.writeAsBytes(bytes);
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Saved ${file.path}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_busy) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return PopupMenuButton<String>(
      tooltip: AppStrings.exportReport,
      icon: const Icon(Icons.ios_share),
      onSelected: _export,
      itemBuilder: (context) => const [
        PopupMenuItem(value: 'xlsx', child: Text(AppStrings.exportExcel)),
        PopupMenuItem(value: 'pdf', child: Text(AppStrings.exportPdf)),
        PopupMenuItem(value: 'csv', child: Text(AppStrings.exportCsv)),
      ],
    );
  }
}
