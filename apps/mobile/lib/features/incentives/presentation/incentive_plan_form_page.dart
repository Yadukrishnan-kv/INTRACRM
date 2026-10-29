import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../targets/application/target_providers.dart';
import '../../targets/domain/target.dart';
import '../application/incentive_providers.dart';
import '../domain/incentive.dart';
import '../domain/incentive_plan_draft.dart';

/// Create or edit an incentive plan and its attainment bands.
///
/// A save is several calls — the plan, then each band, then the status — so
/// the page remembers what already reached the server. If one call fails, the
/// next save picks up from there instead of creating the plan or a band twice.
class IncentivePlanFormPage extends ConsumerStatefulWidget {
  const IncentivePlanFormPage({super.key, this.planId});

  /// Null to create a new plan.
  final String? planId;

  @override
  ConsumerState<IncentivePlanFormPage> createState() => _IncentivePlanFormPageState();
}

class _IncentivePlanFormPageState extends ConsumerState<IncentivePlanFormPage> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _minPercent = TextEditingController(text: '80');
  final _holdPercent = TextEditingController(text: '0');
  final _cap = TextEditingController();

  List<TargetMetric> _metrics = const [];
  String? _metricCode;
  String? _metricName;
  bool? _planIsMoney;
  var _periodType = 'monthly';
  var _effectiveFrom = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime? _effectiveTo;
  var _status = 'draft';

  /// What the server holds, so a save only sends what changed.
  String? _planId;
  int _version = 1;
  String _savedStatus = 'draft';
  List<String> _savedSlabIds = const [];

  List<BandDraft> _bands = const [];
  var _nextKey = 0;
  var _loading = true;
  var _saving = false;
  String? _loadError;

  bool get _isEdit => _planId != null;

  @override
  void initState() {
    super.initState();
    _planId = widget.planId;
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _minPercent.dispose();
    _holdPercent.dispose();
    _cap.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final catalog = await ref.read(targetApiProvider).catalog();
    final plan = widget.planId == null ? null : await ref.read(incentiveApiProvider).getPlan(widget.planId!);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (catalog) {
        case Success(:final value):
          _metrics = value.data.metrics;
        case Err(:final failure):
          _loadError = failure.message;
          return;
      }
      switch (plan) {
        case null:
          _metricCode = _metrics.any((m) => m.code == 'revenue')
              ? 'revenue'
              : (_metrics.isEmpty ? null : _metrics.first.code);
        case Success(:final value):
          _apply(value.data);
        case Err(:final failure):
          _loadError = failure.message;
      }
    });
  }

  void _apply(IncentivePlan plan) {
    _name.text = plan.name;
    _description.text = plan.description ?? '';
    _minPercent.text = bpsToPercentText(plan.minAttainmentBps);
    _holdPercent.text = bpsToPercentText(plan.holdBps);
    _cap.text = paiseToRupeesText(plan.payoutCap);
    _metricCode = plan.metricCode;
    _metricName = plan.metricName;
    _planIsMoney = plan.basis == 'revenue';
    _periodType = plan.periodType;
    _effectiveFrom = DateTime.tryParse(plan.effectiveFrom) ?? _effectiveFrom;
    _effectiveTo = plan.effectiveTo == null ? null : DateTime.tryParse(plan.effectiveTo!);
    _status = plan.status;
    _savedStatus = plan.status;
    _version = plan.version;
    _bands = [for (final slab in plan.slabs) BandDraft.fromSlab(slab, _nextKey++)];
    _savedSlabIds = [for (final slab in plan.slabs) slab.id];
  }

  TargetMetric? get _metric {
    for (final metric in _metrics) {
      if (metric.code == _metricCode) {
        return metric;
      }
    }
    return null;
  }

  bool get _isMoney => _metric?.isMoney ?? _planIsMoney ?? true;

  int get _minBps => percentToBps(_minPercent.text) ?? 0;

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _ymd(DateTime date) => date.toIso8601String().substring(0, 10);

  Future<void> _pickDate({required bool end}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: end ? (_effectiveTo ?? _effectiveFrom) : _effectiveFrom,
      firstDate: end ? _effectiveFrom : DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1095)),
    );
    if (picked == null) {
      return;
    }
    setState(() => end ? _effectiveTo = picked : _effectiveFrom = picked);
  }

  void _changeMetric(String? code) {
    if (code == null || code == _metricCode) {
      return;
    }
    final wasMoney = _isMoney;
    setState(() {
      _metricCode = code;
      // Percent bands only make sense on money, so a switch between money and
      // count metrics invalidates the bands already drawn.
      if (_isMoney != wasMoney && _bands.isNotEmpty) {
        _bands = const [];
        _snack('Bands cleared — this metric pays a different way.');
      }
    });
  }

  Future<void> _editBand([BandDraft? band]) async {
    final sorted = sortBands(_bands);
    final start = band?.fromBps ?? (sorted.isEmpty ? _minBps : (sorted.last.toBps ?? sorted.last.fromBps));
    final result = await showModalBottomSheet<BandDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _BandSheet(
        initial: band,
        keyForNew: _nextKey,
        startBps: start,
        isMoney: _isMoney,
        others: _bands,
      ),
    );
    if (result == null) {
      return;
    }
    setState(() {
      if (band == null) {
        _nextKey++;
        _bands = [..._bands, result];
      } else {
        _bands = [
          for (final existing in _bands)
            existing.key == band.key ? result : existing,
        ];
      }
    });
  }

  void _removeBand(BandDraft band) {
    setState(() => _bands = [for (final b in _bands) if (b.key != band.key) b]);
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final minBps = percentToBps(_minPercent.text);
    final holdBps = percentToBps(_holdPercent.text);
    final capText = _cap.text.trim();
    final cap = capText.isEmpty ? null : rupeesToPaise(capText);
    if (name.length < 2) {
      return _snack('Give the plan a name.');
    }
    if (_metricCode == null) {
      return _snack('Choose what the plan measures.');
    }
    if (minBps == null) {
      return _snack('Enter a minimum attainment %, or 0.');
    }
    if (holdBps == null || holdBps > 10000) {
      return _snack('Hold-back must be between 0 and 100%.');
    }
    if (capText.isNotEmpty && cap == null) {
      return _snack('Payout cap must be an amount in ₹, or left empty.');
    }
    for (final band in _bands) {
      final error = bandError(band);
      if (error != null) {
        return _snack('${band.bandLabel}: $error');
      }
    }
    if (_status == 'active' && _bands.isEmpty) {
      return _snack('Add at least one band before activating the plan.');
    }

    setState(() => _saving = true);
    final api = ref.read(incentiveApiProvider);
    final failure = await () async {
      // 1. The plan itself — always created as a draft, so a half-saved plan
      //    never pays out on an incomplete band ladder.
      if (_planId == null) {
        final created = await api.createPlan({
          'name': name,
          if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
          'metricCode': _metricCode,
          'periodType': _periodType,
          'scopeType': 'membership',
          'basis': basisForMetric(_metricCode!, isMoney: _isMoney),
          'status': 'draft',
          'holdBps': holdBps,
          'minAttainmentBps': minBps,
          'payoutCap': ?cap,
          'effectiveFrom': _ymd(_effectiveFrom),
          if (_effectiveTo != null) 'effectiveTo': _ymd(_effectiveTo!),
        });
        switch (created) {
          case Err(:final failure):
            return failure.message;
          case Success(:final value):
            _planId = value.data.id;
            _version = value.data.version;
            _savedStatus = value.data.status;
        }
      } else {
        final updated = await api.updatePlan(_planId!, {
          'name': name,
          'description': _description.text.trim(),
          'holdBps': holdBps,
          'minAttainmentBps': minBps,
          // Null clears a cap that was set before.
          'payoutCap': cap,
          if (_effectiveTo != null) 'effectiveTo': _ymd(_effectiveTo!),
          'version': _version,
        });
        switch (updated) {
          case Err(:final failure):
            return failure.message;
          case Success(:final value):
            _version = value.data.version;
        }
      }

      // 2. Bands: removals, then edits, then new ones, so bands that move do
      //    not collide with their old selves on the server.
      final changes = bandChanges(bands: _bands, savedIds: _savedSlabIds);
      for (final id in changes.remove) {
        final removed = await api.deleteSlab(_planId!, id);
        if (removed case Err(:final failure)) {
          return failure.message;
        }
        _savedSlabIds = [for (final saved in _savedSlabIds) if (saved != id) saved];
      }
      for (final band in changes.update) {
        final updated = await api.updateSlab(_planId!, band.serverId!, band.toJson());
        if (updated case Err(:final failure)) {
          return '${band.bandLabel}: ${failure.message}';
        }
        _replaceBand(band.copyWith(dirty: false));
      }
      for (final band in changes.create) {
        final created = await api.addSlab(_planId!, band.toJson());
        switch (created) {
          case Err(:final failure):
            return '${band.bandLabel}: ${failure.message}';
          case Success(:final value):
            _replaceBand(band.copyWith(serverId: value.data.id, dirty: false));
            _savedSlabIds = [..._savedSlabIds, value.data.id];
        }
      }

      // 3. Status last, once every band is in place.
      if (_status != _savedStatus) {
        final updated = await api.updatePlan(_planId!, {'status': _status, 'version': _version});
        switch (updated) {
          case Err(:final failure):
            return failure.message;
          case Success(:final value):
            _version = value.data.version;
            _savedStatus = value.data.status;
        }
      }
      return null;
    }();

    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    ref.invalidate(incentivePlansProvider);
    if (failure != null) {
      _snack(failure);
      return;
    }
    _snack(widget.planId == null ? 'Plan created.' : 'Plan saved.');
    context.pop(true);
  }

  void _replaceBand(BandDraft band) {
    _bands = [for (final b in _bands) b.key == band.key ? band : b];
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this plan?'),
        content: const Text(
          'The plan, its bands and any draft payouts are removed. '
          'A plan that has already approved or paid someone cannot be deleted — archive it instead.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    setState(() => _saving = true);
    final result = await ref.read(incentiveApiProvider).deletePlan(_planId!);
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    switch (result) {
      case Err(:final failure):
        _snack(failure.message);
      case Success():
        ref.invalidate(incentivePlansProvider);
        ref.invalidate(incentiveReportProvider);
        _snack('Plan deleted.');
        context.pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.planId == null ? AppStrings.newIncentivePlan : AppStrings.editIncentivePlan;
    if (_loading) {
      return AppScaffold(title: title, body: const AppLoading());
    }
    if (_loadError != null) {
      return AppScaffold(title: title, body: Center(child: Text(_loadError!)));
    }
    final theme = Theme.of(context);
    final warnings = coverageWarnings(_bands, minAttainmentBps: _minBps);
    final statuses = _isEdit && _savedStatus != 'draft'
        ? const ['draft', 'active', 'archived']
        : const ['draft', 'active'];

    return AppScaffold(
      title: title,
      actions: [
        if (widget.planId != null)
          IconButton(
            tooltip: 'Delete plan',
            icon: const Icon(Icons.delete_outline),
            onPressed: _saving ? null : _delete,
          ),
      ],
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xl),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Heading('Plan'),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(controller: _name, label: 'Plan name'),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(controller: _description, label: 'Description (optional)', maxLines: 2),
                const SizedBox(height: AppSpacing.md),
                if (_isEdit)
                  _Locked(
                    label: AppStrings.metric,
                    value: '${_metricName ?? _metricCode} · ${_periodLabel(_periodType)} · from ${_ymd(_effectiveFrom)}',
                  )
                else ...[
                  DropdownButtonFormField<String>(
                    initialValue: _metricCode,
                    decoration: const InputDecoration(labelText: 'Pays on (target metric)'),
                    items: [
                      for (final metric in _metrics)
                        DropdownMenuItem(value: metric.code, child: Text(metric.name)),
                    ],
                    onChanged: _changeMetric,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Reps need a target on this metric for the period, or they earn nothing.',
                    style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'monthly', label: Text('Monthly')),
                      ButtonSegment(value: 'quarterly', label: Text('Quarterly')),
                      ButtonSegment(value: 'yearly', label: Text('Yearly')),
                    ],
                    selected: {_periodType},
                    onSelectionChanged: (value) => setState(() => _periodType = value.first),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _DateTile(label: 'Starts', value: _ymd(_effectiveFrom), onTap: () => _pickDate(end: false)),
                ],
                _DateTile(
                  label: 'Ends',
                  value: _effectiveTo == null ? 'No end date' : _ymd(_effectiveTo!),
                  onTap: () => _pickDate(end: true),
                  onClear: _effectiveTo == null || _isEdit ? null : () => setState(() => _effectiveTo = null),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Heading('Rules'),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: AppTextField(
                        controller: _minPercent,
                        label: 'Minimum attainment %',
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: AppTextField(
                        controller: _holdPercent,
                        label: 'Hold back %',
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(
                  controller: _cap,
                  label: 'Payout cap ₹ (optional)',
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Nothing is paid below the minimum. The hold-back is kept from each payout until released.',
                  style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: _Heading('Bands')),
                    Text(
                      'by % of target',
                      style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                for (final band in sortBands(_bands))
                  _BandTile(
                    band: band,
                    onTap: () => _editBand(band),
                    onRemove: () => _removeBand(band),
                  ),
                for (final warning in warnings)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.warning_amber_rounded, size: 16, color: AppColors.warning),
                        const SizedBox(width: 6),
                        Expanded(child: Text(warning, style: theme.textTheme.bodySmall)),
                      ],
                    ),
                  ),
                const SizedBox(height: AppSpacing.sm),
                OutlinedButton.icon(
                  onPressed: () => _editBand(),
                  icon: const Icon(Icons.add),
                  label: const Text('Add band'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Heading('Status'),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<String>(
                  segments: [
                    for (final status in statuses)
                      ButtonSegment(value: status, label: Text(_statusLabel(status))),
                  ],
                  selected: {_status},
                  onSelectionChanged: (value) => setState(() => _status = value.first),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  switch (_status) {
                    'active' => 'Active plans are used when payouts are computed.',
                    'archived' => 'Archived plans stay on record but are no longer used.',
                    _ => 'Drafts can be computed to preview payouts before going live.',
                  },
                  style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: widget.planId == null ? 'Create plan' : 'Save changes',
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }

  static String _periodLabel(String period) => switch (period) {
        'monthly' => 'Monthly',
        'quarterly' => 'Quarterly',
        'yearly' => 'Yearly',
        _ => period,
      };

  static String _statusLabel(String status) => switch (status) {
        'active' => 'Active',
        'archived' => 'Archived',
        _ => 'Draft',
      };
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}

class _Locked extends StatelessWidget {
  const _Locked({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return InfoRow(
      icon: Icons.lock_outline,
      label: '$label (fixed once created)',
      value: value,
    );
  }
}

class _DateTile extends StatelessWidget {
  const _DateTile({required this.label, required this.value, required this.onTap, this.onClear});

  final String label;
  final String value;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.calendar_today_outlined, size: 20),
      title: Text(label),
      subtitle: Text(value),
      trailing: onClear == null
          ? null
          : IconButton(tooltip: 'Clear', icon: const Icon(Icons.close), onPressed: onClear),
      onTap: onTap,
    );
  }
}

class _BandTile extends StatelessWidget {
  const _BandTile({required this.band, required this.onTap, required this.onRemove});

  final BandDraft band;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final label = band.label?.trim();
    return Card(
      margin: const EdgeInsets.only(top: 8),
      color: context.palette.tealSoft,
      elevation: 0,
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.only(left: 14, right: 4),
        title: Text(
          band.bandLabel,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          [if (label != null && label.isNotEmpty) label, band.payoutLabel].join(' · '),
        ),
        trailing: IconButton(
          tooltip: 'Remove band',
          icon: const Icon(Icons.remove_circle_outline),
          onPressed: onRemove,
        ),
      ),
    );
  }
}

/// Adds or edits one band. Checks the band and its overlap with the others
/// before handing it back, so the form never holds a band the server refuses.
class _BandSheet extends StatefulWidget {
  const _BandSheet({
    required this.initial,
    required this.keyForNew,
    required this.startBps,
    required this.isMoney,
    required this.others,
  });

  final BandDraft? initial;
  final int keyForNew;
  final int startBps;
  final bool isMoney;
  final List<BandDraft> others;

  @override
  State<_BandSheet> createState() => _BandSheetState();
}

class _BandSheetState extends State<_BandSheet> {
  late final _label = TextEditingController(text: widget.initial?.label ?? '');
  late final _from = TextEditingController(text: bpsToPercentText(widget.initial?.fromBps ?? widget.startBps));
  late final _to = TextEditingController(text: bpsToPercentText(widget.initial?.toBps));
  late final _value = TextEditingController(text: _initialValue());
  late final _bonus = TextEditingController(
    text: (widget.initial?.bonusPaise ?? 0) == 0 ? '' : paiseToRupeesText(widget.initial!.bonusPaise),
  );
  late String _kind = _initialKind();
  String? _error;

  List<String> get _kinds => payoutKindsFor(isMoney: widget.isMoney);

  String _initialKind() {
    final kind = widget.initial?.payoutKind;
    return kind != null && _kinds.contains(kind) ? kind : _kinds.first;
  }

  String _initialValue() {
    final band = widget.initial;
    if (band == null) {
      return '';
    }
    return switch (band.payoutKind) {
      PayoutKinds.percent => bpsToPercentText(band.rateBps),
      PayoutKinds.flat => paiseToRupeesText(band.amountPaise),
      PayoutKinds.perUnit => paiseToRupeesText(band.perUnitPaise),
      _ => '',
    };
  }

  @override
  void dispose() {
    _label.dispose();
    _from.dispose();
    _to.dispose();
    _value.dispose();
    _bonus.dispose();
    super.dispose();
  }

  void _done() {
    final from = percentToBps(_from.text);
    final toText = _to.text.trim();
    final to = toText.isEmpty ? null : percentToBps(toText);
    final bonusText = _bonus.text.trim();
    final bonus = bonusText.isEmpty ? 0 : rupeesToPaise(bonusText);
    if (from == null) {
      return setState(() => _error = 'Enter the % of target where this band starts.');
    }
    if (toText.isNotEmpty && to == null) {
      return setState(() => _error = 'Upper % must be a number, or empty for no upper limit.');
    }
    if (bonus == null) {
      return setState(() => _error = 'Bonus must be an amount in ₹, or empty.');
    }
    final percent = _kind == PayoutKinds.percent ? percentToBps(_value.text) : null;
    final money = _kind == PayoutKinds.percent ? null : rupeesToPaise(_value.text);
    final initial = widget.initial;
    final band = BandDraft(
      key: initial?.key ?? widget.keyForNew,
      serverId: initial?.serverId,
      label: _label.text.trim().isEmpty ? null : _label.text.trim(),
      fromBps: from,
      toBps: to,
      payoutKind: _kind,
      rateBps: percent,
      amountPaise: _kind == PayoutKinds.flat ? money : null,
      perUnitPaise: _kind == PayoutKinds.perUnit ? money : null,
      bonusPaise: bonus,
      dirty: initial?.serverId != null,
    );
    final error = bandError(band);
    if (error != null) {
      return setState(() => _error = error);
    }
    final clash = overlappingBand(widget.others, band);
    if (clash != null) {
      return setState(() => _error = 'Overlaps the ${clash.bandLabel} band. Adjust the range.');
    }
    Navigator.pop(context, band);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final valueLabel = switch (_kind) {
      PayoutKinds.percent => 'Pay % of sales',
      PayoutKinds.flat => 'Pay amount ₹',
      _ => 'Pay ₹ per unit',
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.md,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.initial == null ? 'Add band' : 'Edit band',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: AppTextField(
                    controller: _from,
                    label: 'From % of target',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppTextField(
                    controller: _to,
                    label: 'Up to % (optional)',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Leave "Up to" empty for the top band, so everyone above it is paid.',
              style: theme.textTheme.labelSmall?.copyWith(color: context.palette.muted),
            ),
            const SizedBox(height: AppSpacing.md),
            SegmentedButton<String>(
              segments: [
                for (final kind in _kinds) ButtonSegment(value: kind, label: Text(PayoutKinds.title(kind))),
              ],
              selected: {_kind},
              onSelectionChanged: (value) => setState(() {
                _kind = value.first;
                _value.clear();
              }),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _value,
              label: valueLabel,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              controller: _bonus,
              label: 'Bonus ₹ for reaching this band (optional)',
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(controller: _label, label: 'Label (optional, e.g. "Star")'),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(_error!, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: AppSpacing.md),
            AppButton(label: widget.initial == null ? 'Add band' : 'Update band', onPressed: _done),
          ],
        ),
      ),
    );
  }
}
