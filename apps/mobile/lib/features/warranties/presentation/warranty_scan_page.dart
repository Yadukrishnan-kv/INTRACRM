import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../design_system/components/app_scaffold.dart';
import '../../../l10n/app_strings.dart';
import '../domain/warranty.dart';

class WarrantyScanPage extends StatefulWidget {
  const WarrantyScanPage({super.key});

  @override
  State<WarrantyScanPage> createState() => _WarrantyScanPageState();
}

class _WarrantyScanPageState extends State<WarrantyScanPage> {
  var _handled = false;
  String? _hint;

  void _onDetect(BarcodeCapture capture) {
    if (_handled) {
      return;
    }
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value == null || value.isEmpty) {
        continue;
      }
      final token = parseWarrantyToken(value);
      if (token == null) {
        setState(() => _hint = 'Point the camera at a warranty QR code.');
        continue;
      }
      _handled = true;
      if (mounted) {
        context.pop(token);
      }
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.scanWarrantyQr,
      body: Column(
        children: [
          Expanded(
            child: MobileScanner(onDetect: _onDetect),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              _hint ?? 'Align the warranty QR inside the frame.',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
