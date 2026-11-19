import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_assets.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../leads/application/lead_list_controller.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';
import '../domain/quotation_totals.dart';

class QuotationFormPage extends ConsumerStatefulWidget {
  const QuotationFormPage({super.key, this.leadId, this.quotationId});

  final String? leadId;
  final String? quotationId;

  @override
  ConsumerState<QuotationFormPage> createState() => _QuotationFormPageState();
}

const _decimal = TextInputType.numberWithOptions(decimal: true);

String _rupees(int minor) {
  final value = minor / 100;
  return value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
}

String _money(int minor) => '₹${(minor / 100).toStringAsFixed(2)}';

class _LineDraft {
  _LineDraft() {
    quantity.text = '1';
    unit.text = 'Nos';
  }

  _LineDraft.fromItem(QuotationItem item) {
    itemCode.text = item.itemCode ?? '';
    description.text = item.description;
    width.text = item.width == null ? '' : '${item.width}';
    height.text = item.height == null ? '' : '${item.height}';
    unit.text = item.unit;
    quantity.text = '${item.quantity}';
    productId = item.productId;
    unitPrice.text = _rupees(item.unitPriceMinor);
    if (item.vendorPriceMinor != null && item.marginType == 'percent') {
      purchase.text = _rupees(item.vendorPriceMinor!);
      margin.text = '${item.marginValue / 100}';
    }
  }

  final itemCode = TextEditingController();
  final description = TextEditingController();
  final width = TextEditingController();
  final height = TextEditingController();
  final unit = TextEditingController();
  final quantity = TextEditingController();
  final purchase = TextEditingController();
  final margin = TextEditingController();
  final unitPrice = TextEditingController();
  String? productId;

  bool get hasPurchase => purchase.text.trim().isNotEmpty;
  int get qty => int.tryParse(quantity.text.trim()) ?? 1;

  int unitMinor(int step) {
    if (!hasPurchase) {
      return rupeesToMinor(unitPrice.text);
    }
    final marginBps = ((double.tryParse(margin.text.trim()) ?? 0) * 100).round();
    return unitPriceFromPurchase(rupeesToMinor(purchase.text), marginBps, step);
  }

  void dispose() {
    for (final c in [itemCode, description, width, height, unit, quantity, purchase, margin, unitPrice]) {
      c.dispose();
    }
  }

  Map<String, dynamic>? toPayload(int taxBps) {
    final desc = description.text.trim();
    if (desc.length < 2 || qty <= 0) {
      return null;
    }
    return {
      if (productId != null) 'productId': productId,
      if (itemCode.text.trim().isNotEmpty) 'itemCode': itemCode.text.trim(),
      'description': desc,
      'quantity': qty,
      if (double.tryParse(width.text.trim()) != null) 'width': double.parse(width.text.trim()),
      if (double.tryParse(height.text.trim()) != null) 'height': double.parse(height.text.trim()),
      'unit': unit.text.trim().isEmpty ? 'Nos' : unit.text.trim(),
      'taxBps': taxBps,
      if (hasPurchase) ...{
        'vendorPriceMinor': rupeesToMinor(purchase.text),
        'marginType': 'percent',
        'marginValue': ((double.tryParse(margin.text.trim()) ?? 0) * 100).round(),
      } else
        'unitPriceMinor': rupeesToMinor(unitPrice.text),
    };
  }
}

class _ChargeDraft {
  _ChargeDraft(String label, [int? amountMinor]) {
    description.text = label;
    amount.text = amountMinor == null ? '' : _rupees(amountMinor);
  }

  final description = TextEditingController();
  final amount = TextEditingController();

  void dispose() {
    description.dispose();
    amount.dispose();
  }
}

class _SpecDraft {
  _SpecDraft([String label = '', String value = '']) {
    this.label.text = label;
    this.value.text = value;
  }

  final label = TextEditingController();
  final value = TextEditingController();

  void dispose() {
    label.dispose();
    value.dispose();
  }
}

const _chargePresets = ['Transportation Charge', 'Installation Charge', 'Unloading Charge', 'Other Charges'];

class _QuotationFormPageState extends ConsumerState<QuotationFormPage> {
  final _title = TextEditingController();
  final _notes = TextEditingController();
  final _terms = TextEditingController();
  final _gstPct = TextEditingController(text: '18');
  final _discount = TextEditingController();
  String? _leadId;
  DateTime? _validUntil;
  DateTime? _expectedClose;
  var _saving = false;
  var _loading = false;
  var _version = 1;
  var _revision = 1;
  var _isDraft = true;
  var _gstInclusive = true;
  var _customerView = false;
  var _roundingStep = 10000;
  var _lines = [_LineDraft()];
  var _charges = [for (final label in _chargePresets) _ChargeDraft(label)];
  var _specs = <_SpecDraft>[];
  List<QuotationProduct> _products = const [];

  @override
  void initState() {
    super.initState();
    _leadId = widget.leadId;
    Future.microtask(() async {
      await ref.read(leadListControllerProvider.notifier).refresh();
      final catalog = await ref.read(quotationApiProvider).catalog();
      if (!mounted) {
        return;
      }
      final cat = catalog is Success ? catalog.value.data : null;
      if (cat != null) {
        _products = cat.products;
        _roundingStep = cat.roundingStepMinor;
        _gstPct.text = '${cat.defaultGstBps / 100}'.replaceAll(RegExp(r'\.0$'), '');
      }
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
          _revision = quote.revision;
          _isDraft = quote.isDraft;
          _gstInclusive = quote.gstInclusive;
          _discount.text = quote.discountMinor > 0 ? _rupees(quote.discountMinor) : '';
          if (quote.items.isNotEmpty) {
            _gstPct.text = '${quote.items.first.taxBps / 100}'.replaceAll(RegExp(r'\.0$'), '');
          }
          for (final line in _lines) {
            line.dispose();
          }
          _lines = quote.items.isEmpty
              ? [_LineDraft()]
              : [for (final item in quote.items) _LineDraft.fromItem(item)];
          for (final c in _charges) {
            c.dispose();
          }
          _charges = [for (final label in _chargePresets) _ChargeDraft(label)];
          for (final charge in quote.charges) {
            final slot = _charges.where((c) => c.description.text == charge.description && c.amount.text.isEmpty);
            if (slot.isNotEmpty) {
              slot.first.amount.text = _rupees(charge.amountMinor);
            } else {
              _charges.add(_ChargeDraft(charge.description, charge.amountMinor));
            }
          }
          _specs = [for (final s in quote.specs) _SpecDraft(s.label, s.value)];
        }
      } else if (cat != null) {
        _terms.text = cat.defaultTerms;
        _specs = [for (final s in cat.defaultSpecs) _SpecDraft(s.label, s.value)];
      }
      if (mounted) {
        setState(() => _loading = false);
      }
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    _terms.dispose();
    _gstPct.dispose();
    _discount.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    for (final c in _charges) {
      c.dispose();
    }
    for (final s in _specs) {
      s.dispose();
    }
    super.dispose();
  }

  int get _taxBps => (((double.tryParse(_gstPct.text.trim()) ?? 0) * 100).round()).clamp(0, 10000);

  QuotationTotals get _totals => computeQuotationTotals(
        items: [for (final l in _lines) (quantity: l.qty, unitPriceMinor: l.unitMinor(_roundingStep))],
        charges: [for (final c in _charges) rupeesToMinor(c.amount.text)],
        taxBps: _taxBps,
        discountMinor: rupeesToMinor(_discount.text),
        gstInclusive: _gstInclusive,
      );

  int get _profit {
    var margin = 0;
    for (final l in _lines) {
      if (l.hasPurchase) {
        margin += l.qty * (l.unitMinor(_roundingStep) - rupeesToMinor(l.purchase.text));
      }
    }
    return margin - _totals.discountMinor;
  }

  Future<void> _pickValidUntil() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _validUntil ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date != null) {
      setState(() => _validUntil = date);
    }
  }

  Future<void> _pickExpectedClose() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _expectedClose ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date != null) {
      setState(() => _expectedClose = date);
    }
  }

  Future<void> _save({bool send = false}) async {
    final leadId = _leadId;
    final items = [for (final line in _lines) line.toPayload(_taxBps)].whereType<Map<String, dynamic>>().toList();
    if (leadId == null || items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead and at least one line item are required.')),
      );
      return;
    }
    final charges = [
      for (final c in _charges)
        if (rupeesToMinor(c.amount.text) > 0 && c.description.text.trim().length >= 2)
          {'description': c.description.text.trim(), 'amountMinor': rupeesToMinor(c.amount.text), 'taxBps': _taxBps},
    ];
    final specs = [
      for (final s in _specs)
        if (s.label.text.trim().isNotEmpty) {'label': s.label.text.trim(), 'value': s.value.text.trim()},
    ];
    final api = ref.read(quotationApiProvider);
    final validUntil = _validUntil?.toIso8601String().substring(0, 10);
    final expectedClose = _expectedClose?.toIso8601String().substring(0, 10);
    final discount = rupeesToMinor(_discount.text);
    setState(() => _saving = true);
    final result = widget.quotationId == null
        ? await api.create(
            leadId: leadId,
            items: items,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
            terms: _terms.text.trim(),
            validUntilOn: validUntil,
            expectedCloseOn: expectedClose,
            charges: charges,
            specs: specs,
            discountMinor: discount,
            gstInclusive: _gstInclusive,
          )
        : await api.update(
            id: widget.quotationId!,
            version: _version,
            items: items,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
            terms: _terms.text.trim(),
            validUntilOn: validUntil,
            expectedCloseOn: expectedClose,
            charges: charges,
            specs: specs,
            discountMinor: discount,
            gstInclusive: _gstInclusive,
          );
    if (!mounted) {
      return;
    }
    if (result is Success && send) {
      final saved = result.value.data;
      final sent = await api.send(id: saved.id, version: saved.version);
      if (!mounted) {
        return;
      }
      setState(() => _saving = false);
      if (sent is Success) {
        context.pop(true);
      } else if (sent is Err) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved as draft, but sending failed: ${sent.failure.message}')),
        );
      }
      return;
    }
    setState(() => _saving = false);
    if (result is Success) {
      context.pop(true);
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
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
        if (line.itemCode.text.trim().isEmpty && product.sku != null) {
          line.itemCode.text = product.sku!;
        }
        if (product.unitPriceMinor != null && !line.hasPurchase) {
          line.unitPrice.text = _rupees(product.unitPriceMinor!);
        }
      }
    });
  }

  Widget _field(TextEditingController controller, String label,
      {TextInputType? keyboardType, List<TextInputFormatter>? formatters, int maxLines = 1}) {
    return AppTextField(
      controller: controller,
      label: label,
      keyboardType: keyboardType,
      inputFormatters: formatters,
      maxLines: maxLines,
      onChanged: (_) => setState(() {}),
    );
  }

  Widget _h(String text) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xs, bottom: AppSpacing.xs),
        child: Text(
          text,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
      );

  Widget _summary() {
    final t = _totals;
    TextStyle? bold(BuildContext c) => Theme.of(c).textTheme.titleMedium;
    Widget row(String label, String value, {TextStyle? style}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label, style: style), Text(value, style: style)],
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          children: [
            if (_customerView)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Image.asset(AppAssets.logo, height: 40),
                    Text('QUOTATION', style: bold(context)?.copyWith(color: AppColors.teal)),
                  ],
                ),
              ),
            Align(alignment: Alignment.centerLeft, child: _h('Quotation Summary')),
            row('Items total', _money(t.itemsMinor)),
            for (var i = 0; i < _charges.length; i++)
              if (t.chargeMinor[i] > 0) row(_charges[i].description.text, _money(t.chargeMinor[i])),
            row('Subtotal', _money(t.subtotalMinor)),
            row('Discount', '−${_money(t.discountMinor)}'),
            row(_gstInclusive ? 'GST (${_gstPct.text}% included)' : 'GST (${_gstPct.text}%)', _money(t.taxMinor)),
            if (!_customerView && _lines.any((l) => l.hasPurchase)) row('Profit after discount', _money(_profit)),
            const SizedBox(height: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.tealDark,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Grand Total', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  Text(
                    _money(t.totalMinor),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 20),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lineCard(int index) {
    final line = _lines[index];
    final unit = line.unitMinor(_roundingStep);
    if (_customerView) {
      return Card(
        child: ListTile(
          title: Text('${line.itemCode.text.isEmpty ? '' : '${line.itemCode.text} · '}${line.description.text}'),
          subtitle: Text([
            if (line.width.text.isNotEmpty || line.height.text.isNotEmpty)
              '${line.width.text.isEmpty ? '—' : line.width.text} × ${line.height.text.isEmpty ? '—' : line.height.text}',
            'Qty ${line.qty}',
            _money(unit),
          ].join(' · ')),
          trailing: Text(_money(unit * line.qty)),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          children: [
            if (_products.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: line.productId,
                decoration: const InputDecoration(labelText: 'Add from product (optional)'),
                items: [for (final p in _products) DropdownMenuItem(value: p.id, child: Text(p.label))],
                onChanged: (value) => _applyProduct(line, value),
              ),
            const SizedBox(height: AppSpacing.sm),
            _field(line.itemCode, 'Item code (e.g. KW2)'),
            const SizedBox(height: AppSpacing.sm),
            _field(line.description, 'Description (one point per line)', maxLines: 4),
            const SizedBox(height: AppSpacing.sm),
            Row(children: [
              Expanded(child: _field(line.width, 'Width', keyboardType: _decimal)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: _field(line.height, 'Height', keyboardType: _decimal)),
            ]),
            const SizedBox(height: AppSpacing.sm),
            Row(children: [
              Expanded(child: _field(line.unit, 'Unit')),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _field(line.quantity, 'Quantity',
                    keyboardType: TextInputType.number, formatters: [FilteringTextInputFormatter.digitsOnly]),
              ),
            ]),
            const SizedBox(height: AppSpacing.sm),
            Row(children: [
              Expanded(child: _field(line.purchase, 'Purchase price (₹)', keyboardType: _decimal)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: _field(line.margin, 'Margin %', keyboardType: _decimal)),
            ]),
            const SizedBox(height: AppSpacing.sm),
            if (line.hasPurchase)
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Unit price (rounded up): ${_money(unit)}', style: Theme.of(context).textTheme.titleSmall),
              )
            else
              _field(line.unitPrice, 'Unit price (₹) — when there is no purchase price', keyboardType: _decimal),
            const SizedBox(height: AppSpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total ${_money(unit * line.qty)}', style: Theme.of(context).textTheme.titleSmall),
                TextButton(
                  onPressed: _lines.length == 1
                      ? null
                      : () => setState(() {
                            _lines[index].dispose();
                            _lines = [..._lines]..removeAt(index);
                          }),
                  child: const Text(AppStrings.deleteLine),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final leads = ref.watch(leadListControllerProvider).value?.valueOrNull?.items ?? const [];
    final revising = widget.quotationId != null && !_isDraft;
    return AppScaffold(
      title: widget.quotationId == null
          ? AppStrings.createQuotation
          : revising
              ? 'Revise quotation'
              : AppStrings.editQuotation,
      body: _loading
          ? const AppLoading()
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                if (revising)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: Text(
                      'Saving creates revision ${_revision + 1}; the previous figures are kept in the history.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Internal')),
                    ButtonSegment(value: true, label: Text('Customer view')),
                  ],
                  selected: {_customerView},
                  onSelectionChanged: (v) => setState(() => _customerView = v.first),
                ),
                const SizedBox(height: AppSpacing.md),
                _h('Quotation Details'),
                const SizedBox(height: AppSpacing.sm),
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
                _h('Item Details'),
                for (var index = 0; index < _lines.length; index++) ...[
                  const SizedBox(height: AppSpacing.md),
                  _lineCard(index),
                ],
                if (!_customerView)
                  TextButton(
                    onPressed: () => setState(() => _lines = [..._lines, _LineDraft()]),
                    child: const Text('+ Add item'),
                  ),
                if (!_customerView)
                  Container(
                    margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.tealSoft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Pricing Formula: Unit Price = Purchase Price + Margin %  |  '
                      'MRP = Round up to next ₹${(_roundingStep / 100).toStringAsFixed(0)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.tealDark),
                    ),
                  ),
                const SizedBox(height: AppSpacing.sm),
                _h('Additional Charges'),
                for (final c in _charges) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Row(children: [
                    Expanded(flex: 3, child: _field(c.description, 'Charge')),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(flex: 2, child: _field(c.amount, 'Amount (₹)', keyboardType: _decimal)),
                  ]),
                ],
                TextButton(
                  onPressed: () => setState(() => _charges = [..._charges, _ChargeDraft('')]),
                  child: const Text('+ Add charge'),
                ),
                const SizedBox(height: AppSpacing.sm),
                _h('Tax & Discount'),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('GST included')),
                    ButtonSegment(value: false, label: Text('GST extra')),
                  ],
                  selected: {_gstInclusive},
                  onSelectionChanged: (v) => setState(() => _gstInclusive = v.first),
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(children: [
                  Expanded(child: _field(_gstPct, 'GST %', keyboardType: _decimal)),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: _field(_discount, 'Total discount (₹)', keyboardType: _decimal)),
                ]),
                const SizedBox(height: AppSpacing.md),
                _summary(),
                const SizedBox(height: AppSpacing.md),
                _h('Product Specification'),
                for (var i = 0; i < _specs.length; i++) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Row(children: [
                    Expanded(child: AppTextField(controller: _specs[i].label, label: 'Label')),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: AppTextField(controller: _specs[i].value, label: 'Value')),
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => setState(() {
                        _specs[i].dispose();
                        _specs = [..._specs]..removeAt(i);
                      }),
                    ),
                  ]),
                ],
                TextButton(
                  onPressed: () => setState(() => _specs = [..._specs, _SpecDraft()]),
                  child: const Text('+ Add specification'),
                ),
                const SizedBox(height: AppSpacing.md),
                AppTextField(controller: _terms, label: 'Terms and conditions (one per line)', maxLines: 6),
                const SizedBox(height: AppSpacing.md),
                AppTextField(controller: _notes, label: 'Notes (internal)', maxLines: 3),
                const SizedBox(height: AppSpacing.lg),
                if (_saving)
                  const AppLoading()
                else ...[
                  AppButton(
                    label: widget.quotationId == null
                        ? AppStrings.saveDraft
                        : revising
                            ? 'Save revision'
                            : AppStrings.editQuotation,
                    onPressed: _save,
                  ),
                  if (widget.quotationId == null || _isDraft) ...[
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(label: 'Save & send', onPressed: () => _save(send: true)),
                  ],
                ],
              ],
            ),
    );
  }
}
