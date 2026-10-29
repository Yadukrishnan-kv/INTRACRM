import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../auth/application/auth_controller.dart';
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
  var _syncing = false;

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

  Future<void> _syncCustomer() async {
    setState(() => _syncing = true);
    final result = unwrapBilling<BillingCustomer>(
      await ref.read(billingApiProvider).syncCustomer(widget.leadId),
    );
    if (!mounted) {
      return;
    }
    setState(() => _syncing = false);
    final message = switch (result) {
      Success(:final value) => value.warning ?? AppStrings.customerSynced,
      Err(:final failure) => failure.message,
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    if (result is Success) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSync = ref.watch(authControllerProvider).user?.canSyncBilling == true;
    final customer = _snapshot?.customer;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(AppStrings.invoices, style: Theme.of(context).textTheme.titleMedium),
              ),
              if (canSync)
                TextButton.icon(
                  onPressed: _syncing ? null : _syncCustomer,
                  icon: const Icon(Icons.sync, size: 18),
                  label: Text(_syncing ? AppStrings.syncingCustomer : AppStrings.syncCustomer),
                ),
            ],
          ),
          if (customer != null)
            Text(
              '${customer.displayName} · ${customer.syncStatus}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
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
