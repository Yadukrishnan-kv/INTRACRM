import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../catalog/application/catalog_providers.dart';
import '../../catalog/domain/catalog_models.dart';

class TaxesSettingsPage extends ConsumerStatefulWidget {
  const TaxesSettingsPage({super.key});

  @override
  ConsumerState<TaxesSettingsPage> createState() => _TaxesSettingsPageState();
}

class _TaxDraft {
  _TaxDraft({this.id, String name = '', double rate = 0, this.active = true}) {
    this.name.text = name;
    this.rate.text = rate == rate.roundToDouble() ? rate.toStringAsFixed(0) : '$rate';
  }

  factory _TaxDraft.fromItem(CatalogItem item) {
    return _TaxDraft(
      id: item.id,
      name: item.name,
      rate: item.ratePercent ?? item.rateBps / 100,
      active: item.isActive,
    );
  }

  final String? id;
  final name = TextEditingController();
  final rate = TextEditingController();
  bool active;

  void dispose() {
    name.dispose();
    rate.dispose();
  }

  Map<String, dynamic>? toPayload(int index) {
    final label = name.text.trim();
    if (label.length < 2) {
      return null;
    }
    return {
      if (id != null) 'id': id,
      'name': label,
      'ratePercent': double.tryParse(rate.text.trim()) ?? 0,
      'isActive': active,
      'sortOrder': (index + 1) * 10,
    };
  }
}

class _TaxesSettingsPageState extends ConsumerState<TaxesSettingsPage> {
  var _loading = true;
  var _saving = false;
  String? _error;
  List<CatalogItem> _original = const [];
  var _rows = [_TaxDraft(name: 'GST 18%', rate: 18)];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = unwrapCatalog<List<CatalogItem>>(
      await ref.read(catalogApiProvider).list(CatalogKinds.taxes),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _original = value;
          for (final row in _rows) {
            row.dispose();
          }
          _rows = value.isEmpty
              ? [_TaxDraft(name: 'GST 18%', rate: 18)]
              : [for (final item in value) _TaxDraft.fromItem(item)];
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _save() async {
    final items = [
      for (var index = 0; index < _rows.length; index++)
        if (_rows[index].toPayload(index) case final payload?) payload,
    ];
    if (items.isEmpty) {
      setState(() => _error = 'Add at least one named tax');
      return;
    }
    final keepIds = {
      for (final item in items)
        if (item['id'] is String) item['id'] as String,
    };
    final deleteIds = [
      for (final item in _original)
        if (!keepIds.contains(item.id)) item.id,
    ];
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = unwrapCatalog<List<CatalogItem>>(
      await ref.read(catalogApiProvider).saveTaxes(items: items, deleteIds: deleteIds),
    );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    switch (result) {
      case Success():
        await _load();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Taxes saved')),
          );
        }
      case Err(:final failure):
        setState(() => _error = failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.taxes)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(
                  AppStrings.manageTaxes,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: AppSpacing.sm),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: Text(_error!),
                  ),
                for (var index = 0; index < _rows.length; index++)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        children: [
                          AppTextField(controller: _rows[index].name, label: AppStrings.name),
                          const SizedBox(height: AppSpacing.sm),
                          AppTextField(
                            controller: _rows[index].rate,
                            label: AppStrings.taxPercent,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text(AppStrings.active),
                            value: _rows[index].active,
                            onChanged: (value) => setState(() => _rows[index].active = value),
                          ),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: _rows.length == 1
                                  ? null
                                  : () {
                                      setState(() {
                                        _rows[index].dispose();
                                        _rows = [..._rows]..removeAt(index);
                                      });
                                    },
                              child: const Text(AppStrings.deleteLine),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                TextButton(
                  onPressed: () => setState(() => _rows = [..._rows, _TaxDraft()]),
                  child: const Text(AppStrings.addTax),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: AppStrings.saveAllTaxes,
                  onPressed: _save,
                  loading: _saving,
                ),
              ],
            ),
    );
  }
}
