import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/warranty_providers.dart';
import '../domain/warranty.dart';

class WarrantyDetailPage extends ConsumerStatefulWidget {
  const WarrantyDetailPage({super.key, required this.warrantyId});

  final String warrantyId;

  @override
  ConsumerState<WarrantyDetailPage> createState() => _WarrantyDetailPageState();
}

class _WarrantyDetailPageState extends ConsumerState<WarrantyDetailPage> {
  Warranty? _item;
  WarrantyQr? _qr;
  Failure? _failure;
  var _loading = true;
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    final result = await ref.read(warrantyApiProvider).getById(widget.warrantyId);
    final qr = await ref.read(warrantyApiProvider).qr(widget.warrantyId);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (result is Success) {
        _item = result.value.data;
      } else if (result is Err) {
        _failure = result.failure;
      }
      if (qr is Success) {
        _qr = qr.value.data;
      }
    });
  }

  Future<void> _run(Future<Result<dynamic>> Function() action) async {
    setState(() => _busy = true);
    final result = await action();
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is Success) {
      await _reload();
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _copyUrl() async {
    final url = _item?.verifyUrl;
    if (url == null || url.isEmpty) {
      return;
    }
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Verification URL copied')),
    );
  }

  Future<void> _savePdf() async {
    setState(() => _busy = true);
    final result = await ref.read(warrantyApiProvider).pdf(widget.warrantyId);
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is! Success) {
      if (result is Err) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.failure.message)),
        );
      }
      return;
    }
    final pdf = result.value.data;
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/${pdf.fileName}');
    await file.writeAsBytes(base64Decode(pdf.contentBase64));
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('PDF saved to ${file.path}')),
    );
  }

  Future<void> _deleteItem(WarrantyItem line) async {
    final item = _item;
    if (item == null) {
      return;
    }
    final remaining = [
      for (final row in item.items)
        if (row.id != line.id)
          {
            if (row.productId != null) 'productId': row.productId,
            'description': row.description,
            'quantity': row.quantity,
            if (row.serialNumber != null) 'serialNumber': row.serialNumber,
          },
    ];
    if (remaining.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Keep at least one covered item')),
      );
      return;
    }
    await _run(
      () => ref.read(warrantyApiProvider).update(
        id: item.id,
        version: item.version,
        items: remaining,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final user = ref.watch(authControllerProvider).user;
    final qrBytes = _qr == null || _qr!.contentBase64.isEmpty
        ? null
        : base64Decode(_qr!.contentBase64);
    final product = item == null || item.items.isEmpty
        ? item?.leadTitle ?? '—'
        : item.items.first.productName ?? item.items.first.description;
    final details = item == null
        ? '—'
        : [
            if (item.serialNumber != null) 'SN ${item.serialNumber}',
            if (item.quotationNumber != null) item.quotationNumber!,
            if (item.coverageNotes != null) item.coverageNotes!,
            for (final line in item.items)
              [
                line.description,
                'Qty ${line.quantity}',
                if (line.serialNumber != null) 'SN ${line.serialNumber}',
              ].join(' · '),
          ].where((value) => value.trim().isNotEmpty).join('\n');
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Warranty Card'),
        actions: [
          IconButton(
            tooltip: AppStrings.copyVerificationUrl,
            onPressed: _copyUrl,
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: _loading
          ? const AppLoading()
          : _failure != null
          ? AppErrorView(failure: _failure!, onRetry: _reload)
          : item == null
          ? const SizedBox.shrink()
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          Text(
                            'INTRA WARRANTY CERTIFICATE',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: AppColors.teal,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.4,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            width: 72,
                            height: 72,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.teal, width: 2),
                              color: AppColors.tealSoft,
                            ),
                            child: const Icon(Icons.verified, color: AppColors.teal, size: 36),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Quality Assured',
                            style: TextStyle(color: AppColors.teal, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          StatusBadge(label: item.statusLabel),
                          const SizedBox(height: 16),
                          _certRow('Customer Name', item.customerName ?? item.displayTitle),
                          _certRow('Order No.', item.quotationNumber ?? item.cardNumber),
                          _certRow('Product', product),
                          _certRow('Product Details', details.isEmpty ? '—' : details),
                          _certRow('Installation Date', item.warrantyStartOn),
                          _certRow(
                            'Warranty Period',
                            _periodLabel(item.warrantyStartOn, item.warrantyEndOn),
                          ),
                          const SizedBox(height: 20),
                          Align(
                            alignment: Alignment.centerRight,
                            child: Column(
                              children: [
                                Container(width: 88, height: 1, color: AppColors.muted),
                                const SizedBox(height: 6),
                                Text(
                                  item.issuedByName ?? 'Authorised Signatory',
                                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Divider(),
                          const SizedBox(height: 8),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Expanded(
                                child: Text(
                                  'For support, scan the QR code or share the verification link with the customer.',
                                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                                ),
                              ),
                              const SizedBox(width: 12),
                              if (qrBytes != null)
                                Image.memory(qrBytes, width: 84, height: 84)
                              else
                                const Icon(Icons.qr_code_2, size: 84, color: AppColors.muted),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(AppStrings.coveredItems, style: Theme.of(context).textTheme.titleMedium),
                  for (final line in item.items)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(line.description, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text(
                              [
                                'Qty ${line.quantity}',
                                if (line.serialNumber != null) 'SN ${line.serialNumber}',
                                if (line.productName != null) line.productName!,
                              ].join(' · '),
                            ),
                            if (user?.canUpdateWarranty == true && item.status != WarrantyStatuses.voided)
                              Row(
                                children: [
                                  TextButton(
                                    onPressed: () async {
                                      await context.push(AppRoutes.warrantyEditPath(item.id));
                                      await _reload();
                                    },
                                    child: const Text(AppStrings.editLine),
                                  ),
                                  TextButton(
                                    onPressed: item.items.length == 1 ? null : () => _deleteItem(line),
                                    child: const Text(AppStrings.deleteLine),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: 'Download Warranty Card',
                    onPressed: _savePdf,
                    loading: _busy,
                  ),
                  if (user?.canUpdateWarranty == true && item.status != WarrantyStatuses.voided) ...[
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: AppStrings.editWarranty,
                      onPressed: () async {
                        await context.push(AppRoutes.warrantyEditPath(item.id));
                        await _reload();
                      },
                    ),
                  ],
                  if (user?.canUpdateWarranty == true && item.nextStatuses.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      spacing: AppSpacing.sm,
                      children: [
                        for (final status in item.nextStatuses)
                          FilledButton.tonal(
                            onPressed: _busy
                                ? null
                                : () => _run(
                                    () => ref.read(warrantyApiProvider).changeStatus(
                                      id: item.id,
                                      status: status,
                                      version: item.version,
                                    ),
                                  ),
                            child: Text(WarrantyStatuses.title(status)),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _certRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  String _periodLabel(String start, String end) {
    final from = DateTime.tryParse(start);
    final to = DateTime.tryParse(end);
    if (from == null || to == null) {
      return '$start – $end';
    }
    final months = (to.year - from.year) * 12 + (to.month - from.month);
    if (months >= 12 && months % 12 == 0) {
      final years = months ~/ 12;
      return '$years ${years == 1 ? 'Year' : 'Years'}';
    }
    return '$months Months';
  }
}
