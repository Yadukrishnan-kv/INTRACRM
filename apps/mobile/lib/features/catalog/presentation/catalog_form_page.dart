import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../quotations/domain/quotation.dart';
import '../application/catalog_providers.dart';
import '../domain/catalog_models.dart';

class CatalogFormPage extends ConsumerStatefulWidget {
  const CatalogFormPage({super.key, required this.kind, this.itemId});

  final String kind;
  final String? itemId;

  @override
  ConsumerState<CatalogFormPage> createState() => _CatalogFormPageState();
}

class _CatalogFormPageState extends ConsumerState<CatalogFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _sku = TextEditingController();
  final _description = TextEditingController();
  final _sortOrder = TextEditingController(text: '0');
  final _price = TextEditingController();
  final _months = TextEditingController();
  final _winPercent = TextEditingController(text: '0');
  final _rate = TextEditingController(text: '18');
  var _loading = true;
  var _submitting = false;
  var _codeTouched = false;
  var _isActive = true;
  var _isOpen = true;
  var _isWon = false;
  var _isLost = false;
  String? _error;
  String? _parentId;
  String? _categoryId;
  String? _warrantyPeriodId;
  CatalogItem? _existing;
  List<CatalogItem> _categories = const [];
  List<CatalogItem> _periods = const [];

  bool get _isEdit => widget.itemId != null;
  bool get _isProduct => widget.kind == CatalogKinds.products;
  bool get _isCategory => widget.kind == CatalogKinds.categories;
  bool get _isStatus => widget.kind == CatalogKinds.leadStatuses;
  bool get _isPeriod => widget.kind == CatalogKinds.warrantyPeriods;
  bool get _isTax => widget.kind == CatalogKinds.taxes;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _sku.dispose();
    _description.dispose();
    _sortOrder.dispose();
    _price.dispose();
    _months.dispose();
    _winPercent.dispose();
    _rate.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    CatalogLookups lookups = const CatalogLookups();
    if (_isProduct) {
      final loaded = unwrapCatalog<CatalogLookups>(
        await ref.read(catalogApiProvider).lookups(),
      );
      if (loaded is Success<CatalogLookups>) {
        lookups = loaded.value;
      }
    } else if (_isCategory) {
      final listed = unwrapCatalog<List<CatalogItem>>(
        await ref.read(catalogApiProvider).list(CatalogKinds.categories),
      );
      if (listed is Success<List<CatalogItem>>) {
        lookups = CatalogLookups(categories: listed.value);
      }
    }
    CatalogItem? existing;
    if (widget.itemId != null) {
      final listed = unwrapCatalog<List<CatalogItem>>(
        await ref.read(catalogApiProvider).list(widget.kind),
      );
      if (listed is Success<List<CatalogItem>>) {
        final matches = listed.value.where((item) => item.id == widget.itemId);
        existing = matches.isEmpty ? null : matches.first;
      } else if (listed is Err<List<CatalogItem>>) {
        _error = listed.failure.message;
      }
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      _categories = lookups.categories;
      _periods = lookups.warrantyPeriods;
      _existing = existing;
      if (existing != null) {
        _codeTouched = true;
        _name.text = existing.name;
        _code.text = existing.code;
        _sku.text = existing.sku;
        _description.text = existing.description ?? '';
        _sortOrder.text = '${existing.sortOrder}';
        _isActive = existing.isActive;
        _parentId = existing.parentId;
        _categoryId = existing.categoryId;
        _warrantyPeriodId = existing.warrantyPeriodId;
        if (_categoryId != null && !_categories.any((item) => item.id == _categoryId)) {
          _categoryId = null;
        }
        if (_warrantyPeriodId != null && !_periods.any((item) => item.id == _warrantyPeriodId)) {
          _warrantyPeriodId = null;
        }
        if (_parentId != null && !_categories.any((item) => item.id == _parentId)) {
          _parentId = null;
        }
        _price.text = existing.unitPriceMinor == null
            ? ''
            : (existing.unitPriceMinor! / 100).toStringAsFixed(0);
        _months.text = '${existing.months ?? existing.warrantyMonths ?? ''}';
        _isOpen = existing.isOpen;
        _isWon = existing.isWon;
        _isLost = existing.isLost;
        _winPercent.text = (existing.winProbabilityBps / 100).toStringAsFixed(0);
        _rate.text = (existing.ratePercent ?? existing.rateBps / 100).toStringAsFixed(
          existing.rateBps % 100 == 0 ? 0 : 2,
        );
      }
    });
  }

  void _onNameChanged(String value) {
    if (_isEdit || _codeTouched || _isProduct) {
      return;
    }
    _code.text = catalogCodeFromName(value);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final data = <String, dynamic>{
      'name': _name.text.trim(),
      'sortOrder': int.tryParse(_sortOrder.text.trim()) ?? 0,
      'isActive': _isActive,
    };
    if (_isProduct) {
      data['sku'] = _sku.text.trim();
      data['description'] = _description.text.trim();
      data['categoryId'] = _categoryId;
      data['warrantyPeriodId'] = _warrantyPeriodId;
      if (_price.text.trim().isNotEmpty) {
        data['unitPriceMinor'] = rupeesToMinor(_price.text);
      }
    } else {
      data['code'] = catalogCodeFromName(_code.text);
    }
    if (_isCategory) {
      data['parentId'] = _parentId;
    }
    if (_isPeriod) {
      data['months'] = int.tryParse(_months.text.trim()) ?? 1;
    }
    if (_isTax) {
      data['ratePercent'] = double.tryParse(_rate.text.trim()) ?? 0;
    }
    if (_isStatus) {
      data['isOpen'] = _isOpen;
      data['isWon'] = _isWon;
      data['isLost'] = _isLost;
      data['winProbabilityBps'] = ((int.tryParse(_winPercent.text.trim()) ?? 0) * 100).clamp(0, 10000);
    }
    final result = widget.itemId == null
        ? unwrapCatalog<CatalogItem>(await ref.read(catalogApiProvider).create(widget.kind, data))
        : unwrapCatalog<CatalogItem>(
            await ref.read(catalogApiProvider).update(widget.kind, widget.itemId!, data),
          );
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
    switch (result) {
      case Success():
        context.pop();
      case Err(:final failure):
        setState(() => _error = failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: _isEdit ? 'Edit ${CatalogKinds.label(widget.kind)}' : 'Add ${CatalogKinds.label(widget.kind)}',
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Text(_error!),
                    ),
                  AppTextField(
                    controller: _name,
                    label: AppStrings.name,
                    validator: (value) =>
                        value == null || value.trim().length < 2 ? 'Enter a name' : null,
                    onChanged: _onNameChanged,
                  ),
                  if (_isProduct) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _sku,
                      label: AppStrings.sku,
                      validator: (value) =>
                          value == null || value.trim().isEmpty ? 'Enter a SKU' : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _description,
                      label: AppStrings.notes,
                      maxLines: 3,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String?>(
                      initialValue: _categoryId,
                      decoration: const InputDecoration(labelText: AppStrings.category),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('None')),
                        for (final category in _categories)
                          if (category.id != widget.itemId)
                            DropdownMenuItem(value: category.id, child: Text(category.name)),
                      ],
                      onChanged: (value) => setState(() => _categoryId = value),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String?>(
                      initialValue: _warrantyPeriodId,
                      decoration: const InputDecoration(labelText: AppStrings.warrantyPeriod),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('None')),
                        for (final period in _periods)
                          DropdownMenuItem(value: period.id, child: Text(period.name)),
                      ],
                      onChanged: (value) => setState(() => _warrantyPeriodId = value),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _price,
                      label: AppStrings.unitPrice,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    ),
                  ] else ...[
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _code,
                      label: AppStrings.code,
                      validator: (value) {
                        final code = catalogCodeFromName(value ?? '');
                        return RegExp(r'^[a-z][a-z0-9_]*$').hasMatch(code)
                            ? null
                            : 'Use a lowercase letter, then letters, numbers, or underscores.';
                      },
                      onChanged: (_) => _codeTouched = true,
                    ),
                  ],
                  if (_isCategory) ...[
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String?>(
                      initialValue: _parentId,
                      decoration: const InputDecoration(labelText: AppStrings.parentCategory),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('None')),
                        for (final category in _categories)
                          if (category.id != widget.itemId)
                            DropdownMenuItem(value: category.id, child: Text(category.name)),
                      ],
                      onChanged: (value) => setState(() => _parentId = value),
                    ),
                  ],
                  if (_isPeriod) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _months,
                      label: AppStrings.warrantyMonths,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      validator: (value) {
                        final months = int.tryParse(value ?? '');
                        if (months == null || months < 1 || months > 360) {
                          return 'Enter months between 1 and 360.';
                        }
                        return null;
                      },
                    ),
                  ],
                  if (_isTax) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _rate,
                      label: AppStrings.taxPercent,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (value) {
                        final rate = double.tryParse(value ?? '');
                        if (rate == null || rate < 0 || rate > 100) {
                          return 'Enter a rate between 0 and 100.';
                        }
                        return null;
                      },
                    ),
                  ],
                  if (_isStatus) ...[
                    SwitchListTile(
                      title: const Text(AppStrings.openStatus),
                      value: _isOpen,
                      onChanged: (value) => setState(() {
                        _isOpen = value;
                        if (value) {
                          _isWon = false;
                          _isLost = false;
                        }
                      }),
                    ),
                    SwitchListTile(
                      title: const Text(AppStrings.wonStatus),
                      value: _isWon,
                      onChanged: (value) => setState(() {
                        _isWon = value;
                        if (value) {
                          _isLost = false;
                          _isOpen = false;
                        }
                      }),
                    ),
                    SwitchListTile(
                      title: const Text(AppStrings.lostStatus),
                      value: _isLost,
                      onChanged: (value) => setState(() {
                        _isLost = value;
                        if (value) {
                          _isWon = false;
                          _isOpen = false;
                        }
                      }),
                    ),
                    AppTextField(
                      controller: _winPercent,
                      label: AppStrings.winPercent,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    controller: _sortOrder,
                    label: AppStrings.sortOrder,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  ),
                  SwitchListTile(
                    title: const Text(AppStrings.active),
                    value: _isActive,
                    onChanged: _isStatus ? null : (value) => setState(() => _isActive = value),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  AppButton(
                    label: AppStrings.save,
                    loading: _submitting,
                    onPressed: _save,
                  ),
                ],
              ),
            ),
    );
  }
}
