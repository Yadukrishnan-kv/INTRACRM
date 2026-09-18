import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/warranty_providers.dart';
import '../domain/warranty.dart';

class VerifyWarrantyPage extends ConsumerStatefulWidget {
  const VerifyWarrantyPage({super.key, this.initialToken});

  final String? initialToken;

  @override
  ConsumerState<VerifyWarrantyPage> createState() => _VerifyWarrantyPageState();
}

class _VerifyWarrantyPageState extends ConsumerState<VerifyWarrantyPage> {
  final _code = TextEditingController();
  PublicWarranty? _card;
  String? _token;
  String? _error;
  var _verifying = false;
  var _downloading = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialToken;
    if (initial != null && initial.isNotEmpty) {
      _code.text = initial;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _verify();
        }
      });
    }
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final token = parseWarrantyToken(_code.text);
    if (token == null) {
      setState(() {
        _error = 'Enter a valid verification URL or token.';
        _card = null;
        _token = null;
      });
      return;
    }
    setState(() {
      _verifying = true;
      _error = null;
    });
    final result = await ref.read(warrantyApiProvider).verifyPublic(token);
    if (!mounted) {
      return;
    }
    setState(() {
      _verifying = false;
      if (result is Success) {
        _card = result.value.data;
        _token = token;
        _error = null;
      } else if (result is Err) {
        _card = null;
        _token = null;
        _error = result.failure.message;
      }
    });
  }

  Future<void> _scan() async {
    final scanned = await context.push<String>(AppRoutes.verifyWarrantyScan);
    if (!mounted || scanned == null || scanned.isEmpty) {
      return;
    }
    _code.text = scanned;
    await _verify();
  }

  Future<void> _downloadPdf() async {
    final token = _token;
    final card = _card;
    if (token == null || card == null) {
      return;
    }
    setState(() => _downloading = true);
    final result = await ref.read(warrantyApiProvider).downloadPublicPdf(token);
    if (!mounted) {
      return;
    }
    setState(() => _downloading = false);
    if (result is! Success) {
      if (result is Err) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.failure.message)),
        );
      }
      return;
    }
    final dir = await getApplicationDocumentsDirectory();
    final fileName = '${card.cardNumber.replaceAll(RegExp(r'[^\w.-]+'), '_')}.pdf';
    final file = File('${dir.path}/$fileName');
    await file.writeAsBytes(result.value);
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('PDF saved to ${file.path}')),
    );
  }

  void _reset() {
    _code.clear();
    setState(() {
      _card = null;
      _token = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final card = _card;
    return AppScaffold(
      title: AppStrings.verifyWarranty,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Text(
            'Scan the QR on the card, or paste the verification URL.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _code,
            label: AppStrings.warrantyTokenHint,
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.done,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: AppStrings.verifyWarranty,
            loading: _verifying,
            onPressed: _verify,
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: _verifying ? null : _scan,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text(AppStrings.scanWarrantyQr),
          ),
          if (card != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _WarrantyResultCard(card: card),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: AppStrings.downloadWarrantyPdf,
              loading: _downloading,
              onPressed: _downloadPdf,
            ),
            TextButton(
              onPressed: _reset,
              child: const Text(AppStrings.verifyAnotherWarranty),
            ),
          ],
        ],
      ),
    );
  }
}

class _WarrantyResultCard extends StatelessWidget {
  const _WarrantyResultCard({required this.card});

  final PublicWarranty card;

  @override
  Widget build(BuildContext context) {
    final active = card.valid && card.status == WarrantyStatuses.active;
    final color = active
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.error;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          Text(
            active ? 'Verified · ${card.statusLabel}' : card.statusLabel,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(color: color),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(card.cardNumber, style: Theme.of(context).textTheme.headlineSmall),
          if (card.tenantName != null) Text(card.tenantName!),
          if (card.customerName != null) Text('Customer: ${card.customerName}'),
          if (card.serialNumber != null) Text('SN ${card.serialNumber}'),
          if (card.purchasedOn != null) Text('Purchased ${card.purchasedOn}'),
          Text('Valid ${card.warrantyStartOn} to ${card.warrantyEndOn}'),
          if (card.coverageNotes != null) Text(card.coverageNotes!),
          if (card.items.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(AppStrings.coveredItems, style: Theme.of(context).textTheme.titleSmall),
            for (final item in card.items)
              Text(
                '• ${item.description}${item.serialNumber == null ? '' : ' · SN ${item.serialNumber}'}',
              ),
          ],
        ],
        ),
      ),
    );
  }
}
