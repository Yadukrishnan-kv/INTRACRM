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
import '../application/warranty_providers.dart';
import '../domain/warranty.dart';

class WarrantyFormPage extends ConsumerStatefulWidget {
  const WarrantyFormPage({super.key, this.leadId, this.quotationId, this.warrantyId});

  final String? leadId;
  final String? quotationId;
  final String? warrantyId;

  @override
  ConsumerState<WarrantyFormPage> createState() => _WarrantyFormPageState();
}

class _LineDraft {
  _LineDraft() {
    quantity.text = '1';
  }

  _LineDraft.fromItem(WarrantyItem item) {
    description.text = item.description;
    serial.text = item.serialNumber ?? '';
    quantity.text = '${item.quantity}';
    productId = item.productId;
  }

  final description = TextEditingController();
  final serial = TextEditingController();
  final quantity = TextEditingController();
  String? productId;

  void dispose() {
    description.dispose();
    serial.dispose();
    quantity.dispose();
  }

  Map<String, dynamic>? toPayload() {
    final desc = description.text.trim();
    final qty = int.tryParse(quantity.text.trim()) ?? 0;
    if (desc.length < 2 || qty <= 0) {
      return null;
    }
    return {
      if (productId != null) 'productId': productId,
      'description': desc,
      'quantity': qty,
      if (serial.text.trim().isNotEmpty) 'serialNumber': serial.text.trim(),
    };
  }
}

class _WarrantyFormPageState extends ConsumerState<WarrantyFormPage> {
  final _serial = TextEditingController();
  final _notes = TextEditingController();
  String? _leadId;
  DateTime _start = DateTime.now();
  DateTime? _end;
  DateTime? _purchased;
  var _saving = false;
  var _loading = false;
  var _version = 1;
  var _lines = [_LineDraft()];
  List<WarrantyProduct> _products = const [];

  @override
  void initState() {
    super.initState();
    _leadId = widget.leadId;
    Future.microtask(() async {
      await ref.read(leadListControllerProvider.notifier).refresh();
      final catalog = await ref.read(warrantyApiProvider).catalog();
      if (widget.warrantyId != null) {
        setState(() => _loading = true);
        final existing = await ref.read(warrantyApiProvider).getById(widget.warrantyId!);
        if (!mounted) {
          return;
        }
        if (existing is Success) {
          final card = existing.value.data;
          _serial.text = card.serialNumber ?? '';
          _notes.text = card.coverageNotes ?? '';
          _leadId = card.leadId;
          _start = DateTime.tryParse(card.warrantyStartOn) ?? _start;
          _end = DateTime.tryParse(card.warrantyEndOn);
          _purchased = DateTime.tryParse(card.purchasedOn ?? '');
          _version = card.version;
          for (final line in _lines) {
            line.dispose();
          }
          _lines = card.items.isEmpty
              ? [_LineDraft()]
              : [for (final item in card.items) _LineDraft.fromItem(item)];
        }
      }
      if (!mounted) {
        return;
      }
      if (catalog is Success) {
        setState(() {
          _loading = false;
          _products = catalog.value.data.products;
        });
      } else {
        setState(() => _loading = false);
      }
    });
  }

  @override
  void dispose() {
    _serial.dispose();
    _notes.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate({required bool start, required bool purchased}) async {
    final initial = purchased
        ? (_purchased ?? DateTime.now())
        : start
        ? _start
        : (_end ?? _start.add(const Duration(days: 365)));
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (date == null) {
      return;
    }
    setState(() {
      if (purchased) {
        _purchased = date;
      } else if (start) {
        _start = date;
      } else {
        _end = date;
      }
    });
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
        if (product.warrantyMonths != null) {
          _end = DateTime(_start.year, _start.month + product.warrantyMonths!, _start.day);
        }
      }
    });
  }

  Future<void> _save() async {
    final items = [for (final line in _lines) line.toPayload()].whereType<Map<String, dynamic>>().toList();
    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one covered item.')),
      );
      return;
    }
    setState(() => _saving = true);
    final result = widget.warrantyId == null
        ? await ref.read(warrantyApiProvider).create(
            items: items,
            warrantyStartOn: _start.toIso8601String().substring(0, 10),
            leadId: _leadId,
            quotationId: widget.quotationId,
            serialNumber: _serial.text.trim(),
            purchasedOn: _purchased?.toIso8601String().substring(0, 10),
            warrantyEndOn: _end?.toIso8601String().substring(0, 10),
            coverageNotes: _notes.text.trim(),
          )
        : await ref.read(warrantyApiProvider).update(
            id: widget.warrantyId!,
            version: _version,
            items: items,
            serialNumber: _serial.text.trim(),
            purchasedOn: _purchased?.toIso8601String().substring(0, 10),
            warrantyStartOn: _start.toIso8601String().substring(0, 10),
            warrantyEndOn: _end?.toIso8601String().substring(0, 10),
            coverageNotes: _notes.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    final leads = ref.watch(leadListControllerProvider).value?.valueOrNull?.items ?? const [];
    return AppScaffold(
      title: widget.warrantyId == null ? AppStrings.createWarranty : AppStrings.editWarranty,
      body: _loading
          ? const AppLoading()
          : ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          if (widget.leadId == null && widget.warrantyId == null)
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
          AppTextField(controller: _serial, label: AppStrings.serialNumber),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.purchasedOn),
            subtitle: Text(_purchased?.toIso8601String().substring(0, 10) ?? 'Optional'),
            trailing: const Icon(Icons.event),
            onTap: () => _pickDate(start: false, purchased: true),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.warrantyStart),
            subtitle: Text(_start.toIso8601String().substring(0, 10)),
            trailing: const Icon(Icons.event),
            onTap: () => _pickDate(start: true, purchased: false),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.warrantyEnd),
            subtitle: Text(_end?.toIso8601String().substring(0, 10) ?? 'Default from product'),
            trailing: const Icon(Icons.event),
            onTap: () => _pickDate(start: false, purchased: false),
          ),
          AppTextField(controller: _notes, label: AppStrings.coverageNotes, maxLines: 3),
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.coveredItems, style: Theme.of(context).textTheme.titleMedium),
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
                    AppTextField(controller: _lines[index].description, label: AppStrings.description),
                    AppTextField(controller: _lines[index].serial, label: AppStrings.serialNumber),
                    AppTextField(
                      controller: _lines[index].quantity,
                      label: AppStrings.quantity,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
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
            onPressed: () => setState(() => _lines = [..._lines, _LineDraft()]),
            child: const Text('Add item'),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: widget.warrantyId == null ? AppStrings.saveWarranty : AppStrings.editWarranty,
            onPressed: _save,
            loading: _saving,
          ),
        ],
      ),
    );
  }
}
