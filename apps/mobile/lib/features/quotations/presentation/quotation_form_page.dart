import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../leads/application/lead_list_controller.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';

class QuotationFormPage extends ConsumerStatefulWidget {
  const QuotationFormPage({super.key, this.leadId, this.quotationId});

  final String? leadId;
  final String? quotationId;

  @override
  ConsumerState<QuotationFormPage> createState() => _QuotationFormPageState();
}

class _LineDraft {
  _LineDraft() {
    quantity.text = '1';
    discount.text = '0';
    taxPct.text = '18';
  }

  _LineDraft.fromItem(QuotationItem item) {
    description.text = item.description;
    quantity.text = '${item.quantity}';
    unitPrice.text = (item.unitPriceMinor / 100).toStringAsFixed(0);
    discount.text = (item.discountMinor / 100).toStringAsFixed(0);
    taxPct.text = (item.taxBps / 100).toStringAsFixed(0);
    productId = item.productId;
    taxRateIds = [...item.taxRateIds];
  }

  final description = TextEditingController();
  final quantity = TextEditingController();
  final unitPrice = TextEditingController();
  final discount = TextEditingController();
  final taxPct = TextEditingController();
  String? productId;
  List<String> taxRateIds = [];

  void dispose() {
    description.dispose();
    quantity.dispose();
    unitPrice.dispose();
    discount.dispose();
    taxPct.dispose();
  }

  Map<String, dynamic>? toPayload() {
    final desc = description.text.trim();
    final qty = int.tryParse(quantity.text.trim()) ?? 0;
    if (desc.length < 2 || qty <= 0) {
      return null;
    }
    final tax = double.tryParse(taxPct.text.trim()) ?? 0;
    return {
      if (productId != null) 'productId': productId,
      'description': desc,
      'quantity': qty,
      'unitPriceMinor': rupeesToMinor(unitPrice.text),
      'discountMinor': rupeesToMinor(discount.text),
      if (taxRateIds.isNotEmpty) 'taxRateIds': taxRateIds,
      if (taxRateIds.isEmpty) 'taxBps': (tax * 100).round().clamp(0, 10000),
    };
  }
}

class _QuotationFormPageState extends ConsumerState<QuotationFormPage> {
  final _title = TextEditingController();
  final _notes = TextEditingController();
  final _terms = TextEditingController();
  String? _leadId;
  DateTime? _validUntil;
  DateTime? _expectedClose;
  var _saving = false;
  var _loading = false;
  var _version = 1;
  var _lines = [_LineDraft()];
  List<QuotationProduct> _products = const [];
  List<QuotationTax> _taxes = const [];

  @override
  void initState() {
    super.initState();
    _leadId = widget.leadId;
    Future.microtask(() async {
      await ref.read(leadListControllerProvider.notifier).refresh();
      final catalog = await ref.read(quotationApiProvider).catalog();
      if (widget.quotationId != null) {
        setState(() => _loading = true);
        final existing = await ref.read(quotationApiProvider).getById(widget.quotationId!);
        if (!mounted) {
          return;
        }
        if (existing is Success) {
          final quote = existing.value.data;
          _title.text = quote.title ?? '';
          _notes.text = quote.notes ?? '';
          _terms.text = quote.terms ?? '';
          _leadId = quote.leadId;
          _validUntil = DateTime.tryParse(quote.validUntilOn ?? '');
          _expectedClose = DateTime.tryParse(quote.expectedCloseOn ?? '');
          _version = quote.version;
          for (final line in _lines) {
            line.dispose();
          }
          _lines = quote.items.isEmpty
              ? [_LineDraft()]
              : [for (final item in quote.items) _LineDraft.fromItem(item)];
        }
      }
      if (!mounted) {
        return;
      }
      if (catalog is Success) {
        setState(() {
          _loading = false;
          _products = catalog.value.data.products;
          _taxes = catalog.value.data.taxes;
          for (final line in _lines) {
            _applyDefaultTax(line);
          }
        });
      } else {
        setState(() => _loading = false);
      }
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    _terms.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  Future<void> _pickValidUntil() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _validUntil ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) {
      return;
    }
    setState(() => _validUntil = date);
  }

  Future<void> _pickExpectedClose() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _expectedClose ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) {
      return;
    }
    setState(() => _expectedClose = date);
  }

  Future<void> _save() async {
    final leadId = _leadId;
    final items = [for (final line in _lines) line.toPayload()].whereType<Map<String, dynamic>>().toList();
    if (leadId == null || items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead and at least one line item are required.')),
      );
      return;
    }
    setState(() => _saving = true);
    final result = widget.quotationId == null
        ? await ref.read(quotationApiProvider).create(
            leadId: leadId,
            items: items,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
            terms: _terms.text.trim(),
            validUntilOn: _validUntil?.toIso8601String().substring(0, 10),
            expectedCloseOn: _expectedClose?.toIso8601String().substring(0, 10),
          )
        : await ref.read(quotationApiProvider).update(
            id: widget.quotationId!,
            version: _version,
            items: items,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
            terms: _terms.text.trim(),
            validUntilOn: _validUntil?.toIso8601String().substring(0, 10),
            expectedCloseOn: _expectedClose?.toIso8601String().substring(0, 10),
          );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Success) {
      context.pop(true);
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  void _applyDefaultTax(_LineDraft line) {
    if (line.taxRateIds.isNotEmpty || _taxes.isEmpty) {
      return;
    }
    for (final tax in _taxes) {
      if (tax.code == 'gst_18' || tax.rateBps == 1800) {
        line.taxRateIds = [tax.id];
        return;
      }
    }
  }

  void _applyProduct(_LineDraft line, String? productId) {
    setState(() {
      line.productId = productId;
      if (productId == null) {
        return;
      }
      for (final product in _products) {
        if (product.id != productId) {
          continue;
        }
        if (line.description.text.trim().isEmpty) {
          line.description.text = product.name;
        }
        if (product.unitPriceMinor != null) {
          line.unitPrice.text = (product.unitPriceMinor! / 100).toStringAsFixed(0);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final leads = ref.watch(leadListControllerProvider).value?.valueOrNull?.items ?? const [];
    return AppScaffold(
      title: widget.quotationId == null ? AppStrings.createQuotation : AppStrings.editQuotation,
      body: _loading
          ? const AppLoading()
          : ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          if (widget.leadId == null && widget.quotationId == null)
            DropdownButtonFormField<String>(
              initialValue: _leadId,
              decoration: const InputDecoration(labelText: AppStrings.leads),
              items: [
                for (final lead in leads)
                  DropdownMenuItem(value: lead.id, child: Text('${lead.leadNumber} ${lead.title}')),
              ],
              onChanged: (value) => setState(() => _leadId = value),
            ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _title, label: AppStrings.quotationTitle),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.validUntil),
            subtitle: Text(_validUntil?.toIso8601String().substring(0, 10) ?? 'Optional'),
            trailing: const Icon(Icons.event),
            onTap: _pickValidUntil,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.expectedCloseDate),
            subtitle: Text(_expectedClose?.toIso8601String().substring(0, 10) ?? 'Optional'),
            trailing: const Icon(Icons.flag_outlined),
            onTap: _pickExpectedClose,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(AppStrings.lineItems, style: Theme.of(context).textTheme.titleMedium),
          for (var index = 0; index < _lines.length; index++) ...[
            const SizedBox(height: AppSpacing.md),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  children: [
                    if (_products.isNotEmpty)
                      DropdownButtonFormField<String>(
                        initialValue: _lines[index].productId,
                        decoration: const InputDecoration(labelText: 'Product (optional)'),
                        items: [
                          for (final product in _products)
                            DropdownMenuItem(value: product.id, child: Text(product.label)),
                        ],
                        onChanged: (value) => _applyProduct(_lines[index], value),
                      ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(controller: _lines[index].description, label: AppStrings.description),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      controller: _lines[index].quantity,
                      label: 'Quantity',
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      controller: _lines[index].unitPrice,
                      label: AppStrings.unitPrice,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      controller: _lines[index].discount,
                      label: AppStrings.lineDiscount,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    if (_taxes.isNotEmpty) ...[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(AppStrings.tax, style: Theme.of(context).textTheme.labelLarge),
                      ),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final tax in _taxes)
                            FilterChip(
                              label: Text(tax.label),
                              selected: _lines[index].taxRateIds.contains(tax.id),
                              onSelected: (selected) {
                                setState(() {
                                  final ids = [..._lines[index].taxRateIds];
                                  if (selected) {
                                    ids.add(tax.id);
                                  } else {
                                    ids.remove(tax.id);
                                  }
                                  _lines[index].taxRateIds = ids;
                                });
                              },
                            ),
                        ],
                      ),
                    ] else
                      AppTextField(
                        controller: _lines[index].taxPct,
                        label: AppStrings.taxPercent,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _lines.length == 1
                            ? null
                            : () {
                                setState(() {
                                  _lines[index].dispose();
                                  _lines = [..._lines]..removeAt(index);
                                });
                              },
                        child: const Text(AppStrings.deleteLine),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          TextButton(
            onPressed: () => setState(() {
              final line = _LineDraft();
              _applyDefaultTax(line);
              _lines = [..._lines, line];
            }),
            child: const Text(AppStrings.addLineItem),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _notes, label: AppStrings.activityNotes, maxLines: 3),
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _terms, label: AppStrings.quotationTerms, maxLines: 3),
          const SizedBox(height: AppSpacing.lg),
          if (_saving)
            const AppLoading()
          else
            AppButton(
              label: widget.quotationId == null ? AppStrings.saveDraft : AppStrings.editQuotation,
              onPressed: _save,
            ),
        ],
      ),
    );
  }
}
