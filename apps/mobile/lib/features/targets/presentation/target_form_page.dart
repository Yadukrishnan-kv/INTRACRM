import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/target_providers.dart';
import '../domain/target.dart';

class TargetFormPage extends ConsumerStatefulWidget {
  const TargetFormPage({super.key, this.targetId});

  /// When set, the form edits this target instead of creating a new one.
  final String? targetId;

  @override
  ConsumerState<TargetFormPage> createState() => _TargetFormPageState();
}

class _TargetFormPageState extends ConsumerState<TargetFormPage> {
  final _value = TextEditingController();
  final _notes = TextEditingController();
  var _kind = TargetKinds.monthly;
  var _scopeType = 'tenant';
  String? _metricCode;
  String? _teamId;
  String? _staffId;
  String? _productId;
  DateTime _anchor = DateTime.now();
  TargetCatalog? _catalog;
  var _loading = true;
  var _saving = false;
  String? _error;
  Target? _existing;

  bool get _isEdit => widget.targetId != null;

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  @override
  void dispose() {
    _value.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    final api = ref.read(targetApiProvider);
    final result = await api.catalog();
    final existing = _isEdit ? await api.getById(widget.targetId!) : null;
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _catalog = value.data;
          if (existing case Success(:final value)) {
            _prefill(value.data);
          }
          _metricCode ??= value.data.metrics.isNotEmpty ? value.data.metrics.first.code : null;
        case Err(:final failure):
          _error = failure.message;
      }
      if (existing case Err(:final failure)) {
        _error = failure.message;
      }
    });
  }

  void _prefill(Target target) {
    _existing = target;
    _metricCode = target.metricCode;
    _scopeType = target.scopeType;
    _productId = target.productId;
    _anchor = DateTime.tryParse(target.periodStart) ?? _anchor;
    _notes.text = target.notes ?? '';
    switch (target.scopeType) {
      case 'team':
        _teamId = target.scopeId;
      case 'membership':
        _staffId = target.scopeId;
    }
    _kind = target.periodType == TargetKinds.daily
        ? TargetKinds.daily
        : target.scopeType == 'team'
        ? TargetKinds.team
        : target.productId != null
        ? TargetKinds.product
        : TargetKinds.monthly;
    final isMoney = _metric?.isMoney == true;
    final display = isMoney ? target.targetValue / 100 : target.targetValue;
    _value.text = display == display.roundToDouble()
        ? display.toStringAsFixed(0)
        : display.toString();
  }

  TargetMetric? get _metric {
    final code = _metricCode;
    if (code == null) {
      return null;
    }
    for (final metric in _catalog?.metrics ?? const <TargetMetric>[]) {
      if (metric.code == code) {
        return metric;
      }
    }
    return null;
  }

  String get _periodType => _kind == TargetKinds.daily ? TargetKinds.daily : TargetKinds.monthly;

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _anchor,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null) {
      return;
    }
    setState(() => _anchor = date);
  }

  Future<void> _save() async {
    final metric = _metric;
    final raw = double.tryParse(_value.text.trim());
    if (metric == null || raw == null || raw < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Metric and a target value are required.')),
      );
      return;
    }
    if (_kind == TargetKinds.team && _teamId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a team.')));
      return;
    }
    if (_kind == TargetKinds.product && _productId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a product.')));
      return;
    }
    if (_scopeType == 'team' && _teamId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a team.')));
      return;
    }
    if (_scopeType == 'membership' && _staffId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a staff member.')));
      return;
    }
    final scopeType = _kind == TargetKinds.team ? 'team' : _scopeType;
    final scopeId = switch (scopeType) {
      'team' => _teamId,
      'membership' => _staffId,
      _ => null,
    };
    final targetValue = metric.isMoney ? (raw * 100).roundToDouble() : raw;
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'periodType': _periodType,
      'scopeType': scopeType,
      'metricCode': metric.code,
      'targetValue': targetValue,
      'periodStart': _anchor.toIso8601String().substring(0, 10),
      'scopeId': ?scopeId,
      if (_productId != null) 'productId': _productId,
      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
    };
    final existing = _existing;
    final api = ref.read(targetApiProvider);
    final result = existing == null
        ? await api.create(body)
        : await api.updateTarget(existing.id, {...body, 'version': existing.version});
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Success) {
      context.pop(true);
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _isEdit ? AppStrings.editTarget : AppStrings.createTarget;
    if (_loading) {
      return AppScaffold(title: title, body: const AppLoading());
    }
    if (_error != null) {
      return AppScaffold(title: title, body: Center(child: Text(_error!)));
    }
    final catalog = _catalog;
    return AppScaffold(
      title: title,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final kind in [TargetKinds.monthly, TargetKinds.daily, TargetKinds.team, TargetKinds.product])
                ChoiceChip(
                  label: Text(TargetKinds.title(kind)),
                  selected: _kind == kind,
                  onSelected: (_) => setState(() {
                    _kind = kind;
                    if (kind == TargetKinds.team) {
                      _scopeType = 'team';
                    }
                    if (kind == TargetKinds.product) {
                      _metricCode = catalog?.metrics.any((m) => m.code == 'units_sold') == true
                          ? 'units_sold'
                          : _metricCode;
                    }
                  }),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: _metricCode,
            decoration: const InputDecoration(labelText: AppStrings.metric),
            items: [
              for (final metric in catalog?.metrics ?? const <TargetMetric>[])
                DropdownMenuItem(value: metric.code, child: Text(metric.name)),
            ],
            onChanged: (value) => setState(() => _metricCode = value),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _value,
            label: _metric?.isMoney == true ? AppStrings.targetValueRupees : AppStrings.targetValue,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_kind == TargetKinds.daily ? AppStrings.day : AppStrings.month),
            subtitle: Text(_anchor.toIso8601String().substring(0, 10)),
            trailing: const Icon(Icons.calendar_today),
            onTap: _pickDate,
          ),
          if (_kind != TargetKinds.team) ...[
            const SizedBox(height: AppSpacing.sm),
            DropdownButtonFormField<String>(
              initialValue: _scopeType,
              decoration: const InputDecoration(labelText: AppStrings.scope),
              items: const [
                DropdownMenuItem(value: 'tenant', child: Text('Company')),
                DropdownMenuItem(value: 'team', child: Text('Team')),
                DropdownMenuItem(value: 'membership', child: Text('Staff')),
              ],
              onChanged: (value) => setState(() => _scopeType = value ?? 'tenant'),
            ),
          ],
          if (_kind == TargetKinds.team || _scopeType == 'team') ...[
            const SizedBox(height: AppSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _teamId,
              decoration: const InputDecoration(labelText: AppStrings.team),
              items: [
                for (final team in catalog?.teams ?? const <TargetOption>[])
                  DropdownMenuItem(value: team.id, child: Text(team.name)),
              ],
              onChanged: (value) => setState(() => _teamId = value),
            ),
          ],
          if (_scopeType == 'membership' && _kind != TargetKinds.team) ...[
            const SizedBox(height: AppSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _staffId,
              decoration: const InputDecoration(labelText: AppStrings.staff),
              items: [
                for (final member in catalog?.staff ?? const <TargetOption>[])
                  DropdownMenuItem(value: member.id, child: Text(member.name)),
              ],
              onChanged: (value) => setState(() => _staffId = value),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: _productId ?? '',
            decoration: InputDecoration(
              labelText: _kind == TargetKinds.product ? AppStrings.product : '${AppStrings.product} (optional)',
            ),
            items: [
              const DropdownMenuItem(value: '', child: Text('None')),
              for (final product in catalog?.products ?? const <TargetOption>[])
                DropdownMenuItem(value: product.id, child: Text(product.name)),
            ],
            onChanged: (value) => setState(() => _productId = (value == null || value.isEmpty) ? null : value),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _notes,
            label: AppStrings.notes,
            maxLines: 3,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: AppStrings.saveTarget, loading: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
