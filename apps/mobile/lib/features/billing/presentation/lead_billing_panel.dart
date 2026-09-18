import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/billing_providers.dart';
import '../domain/billing_models.dart';

class LeadBillingPanel extends ConsumerStatefulWidget {
  const LeadBillingPanel({super.key, required this.leadId});

  final String leadId;

  @override
  ConsumerState<LeadBillingPanel> createState() => _LeadBillingPanelState();
}

class _LeadBillingPanelState extends ConsumerState<LeadBillingPanel> {
  BillingSnapshot? _snapshot;
  String? _error;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final result = unwrapBilling<BillingSnapshot>(
      await ref.read(billingApiProvider).snapshot(widget.leadId),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _snapshot = value;
          _error = null;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(AppStrings.invoices, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Text(_error!),
          if (_snapshot != null && _snapshot!.invoices.isEmpty && _error == null)
            const Text('No invoices yet'),
          for (final invoice in _snapshot?.invoices ?? const <BillingInvoice>[])
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(invoice.invoiceNumber),
              subtitle: Text(
                [
                  invoice.paymentLabel,
                  '${invoice.currency} ${(invoice.balanceMinor / 100).toStringAsFixed(2)} due',
                  if (invoice.dueOn != null) 'Due ${invoice.dueOn}',
                ].join(' · '),
              ),
              trailing: Chip(label: Text(invoice.paymentLabel)),
            ),
        ],
      ),
    );
  }
}
