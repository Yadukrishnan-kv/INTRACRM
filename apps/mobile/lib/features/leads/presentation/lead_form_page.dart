import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../follow_ups/presentation/follow_up_widgets.dart';
import '../application/lead_list_controller.dart';
import '../domain/lead.dart';

class LeadFormPage extends ConsumerStatefulWidget {
  const LeadFormPage({super.key, this.leadId});

  final String? leadId;

  @override
  ConsumerState<LeadFormPage> createState() => _LeadFormPageState();
}

class _LeadFormPageState extends ConsumerState<LeadFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _customerName = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _city = TextEditingController();
  final _requirement = TextEditingController();
  final _value = TextEditingController();
  final _followUpNotes = TextEditingController();

  LeadLookups? _lookups;
  Lead? _existing;
  String? _sourceId;
  String? _quality;
  String? _ownerMembershipId;
  DateTime? _followUpDueAt;
  String _followUpType = FollowUpTypes.call;
  var _loading = true;
  var _submitting = false;
  String? _error;

  bool get _isEdit => widget.leadId != null;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _title.dispose();
    _customerName.dispose();
    _phone.dispose();
    _email.dispose();
    _city.dispose();
    _requirement.dispose();
    _value.dispose();
    _followUpNotes.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final repo = ref.read(leadRepositoryProvider);
    final lookups = await repo.lookups();
    Lead? existing;
    if (widget.leadId != null) {
      final loaded = await repo.getById(widget.leadId!);
      loaded.when(
        success: (lead) => existing = lead,
        failure: (failure) => _error = failure.message,
      );
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      lookups.when(
        success: (value) {
          _lookups = value;
          _ownerMembershipId ??=
              existing?.ownerMembershipId ??
              (value.staff.isNotEmpty ? value.staff.first.id : null);
        },
        failure: (failure) => _error = failure.message,
      );
      if (existing != null) {
        _existing = existing;
        _title.text = existing!.title;
        _customerName.text = existing!.customerName ?? '';
        _phone.text = existing!.primaryPhone ?? '';
        _email.text = existing!.primaryEmail ?? '';
        _city.text = existing!.city ?? '';
        _requirement.text = existing!.requirement ?? '';
        if (existing!.estimatedValueMinor != null) {
          _value.text = (existing!.estimatedValueMinor! / 100).toStringAsFixed(0);
        }
        _sourceId = existing!.sourceId;
        _quality = existing!.quality;
        _ownerMembershipId = existing!.ownerMembershipId;
      }
    });
  }

  CreateLeadInput? _input() {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return null;
    }
    final rupees = _value.text.trim();
    int? minor;
    if (rupees.isNotEmpty) {
      final parsed = double.tryParse(rupees);
      if (parsed == null || parsed < 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Estimated value must be 0 or more')),
        );
        return null;
      }
      minor = (parsed * 100).round();
    }
    return CreateLeadInput(
      title: _title.text.trim(),
      customerName: _customerName.text.trim(),
      primaryPhone: _phone.text.trim(),
      primaryEmail: _email.text.trim(),
      city: _city.text.trim(),
      requirement: _requirement.text.trim(),
      sourceId: _sourceId,
      quality: _quality,
      estimatedValueMinor: minor,
      ownerMembershipId: _ownerMembershipId,
      followUpDueAt: _isEdit ? null : _followUpDueAt,
      followUpNotes: _isEdit ? null : _followUpNotes.text.trim(),
      followUpType: _isEdit ? null : _followUpType,
    );
  }

  Future<void> _submit() async {
    final input = _input();
    if (input == null) {
      return;
    }
    setState(() => _submitting = true);
    final repo = ref.read(leadRepositoryProvider);
    final result = widget.leadId == null
        ? await repo.create(input)
        : await repo.update(
            id: widget.leadId!,
            input: input,
            version: _existing?.version,
          );
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
    result.when(
      success: (_) {
        context.pop();
      },
      failure: (failure) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(failure.message)));
      },
    );
  }

  Future<void> _pickFollowUp() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _followUpDueAt ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _followUpDueAt ?? DateTime.now().add(const Duration(hours: 1)),
      ),
    );
    if (time == null) {
      return;
    }
    setState(() {
      _followUpDueAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  @override
  Widget build(BuildContext context) {
    final lookups = _lookups;
    return AppScaffold(
      title: _isEdit ? AppStrings.editLead : AppStrings.createLead,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Form(
                key: _formKey,
                child: ListView(
                  children: [
                    Text(
                      AppStrings.customerInformation,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      controller: _customerName,
                      label: AppStrings.customerName,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _phone,
                      label: AppStrings.phone,
                      keyboardType: TextInputType.phone,
                      validator: _phoneValidator,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _email,
                      label: AppStrings.email,
                      keyboardType: TextInputType.emailAddress,
                      validator: _emailValidator,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(controller: _city, label: AppStrings.city),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      AppStrings.requirementInformation,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      controller: _title,
                      label: AppStrings.leadTitle,
                      validator: (value) =>
                          value == null || value.trim().length < 2
                          ? 'Title must be at least 2 characters'
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _requirement,
                      label: AppStrings.requirement,
                      maxLines: 4,
                      validator: (value) =>
                          value != null && value.length > 2000
                          ? 'Requirement is too long'
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      AppStrings.leadSource,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    DropdownButtonFormField<String>(
                      initialValue: _sourceId,
                      decoration: const InputDecoration(labelText: AppStrings.leadSource),
                      items: [
                        for (final source in lookups?.sources ?? const <LeadSourceOption>[])
                          DropdownMenuItem(value: source.id, child: Text(source.name)),
                      ],
                      onChanged: (value) => setState(() => _sourceId = value),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      AppStrings.leadQuality,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.xs,
                      children: [
                        for (final quality in lookups?.qualities ??
                            const [
                              LeadQualityChoice(code: 'hot', name: 'Hot'),
                              LeadQualityChoice(code: 'warm', name: 'Warm'),
                              LeadQualityChoice(code: 'cold', name: 'Cold'),
                            ])
                          ChoiceChip(
                            label: Text(quality.name),
                            selected: _quality == quality.code,
                            onSelected: (selected) {
                              setState(() => _quality = selected ? quality.code : null);
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    AppTextField(
                      controller: _value,
                      label: AppStrings.estimatedValue,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      AppStrings.assignedStaff,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    DropdownButtonFormField<String>(
                      initialValue: _ownerMembershipId,
                      decoration: const InputDecoration(labelText: AppStrings.assignedStaff),
                      items: [
                        for (final staff in lookups?.staff ?? const <LeadStaffOption>[])
                          DropdownMenuItem(
                            value: staff.id,
                            child: Text(
                              staff.designation == null
                                  ? staff.fullName
                                  : '${staff.fullName} · ${staff.designation}',
                            ),
                          ),
                      ],
                      onChanged: (value) => setState(() => _ownerMembershipId = value),
                    ),
                    if (!_isEdit) ...[
                      const SizedBox(height: AppSpacing.lg),
                      Text(
                        AppStrings.followUp,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      FollowUpTypeChips(
                        value: _followUpType,
                        onChanged: (value) => setState(() => _followUpType = value),
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          _followUpDueAt == null
                              ? AppStrings.scheduleFollowUp
                              : _followUpDueAt!.toLocal().toString().substring(0, 16),
                        ),
                        trailing: const Icon(Icons.event),
                        onTap: _pickFollowUp,
                      ),
                      AppTextField(
                        controller: _followUpNotes,
                        label: AppStrings.followUpNotes,
                        maxLines: 2,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    AppButton(
                      label: _isEdit ? AppStrings.saveLead : AppStrings.createLead,
                      loading: _submitting,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  String? _phoneValidator(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return null;
    }
    final e164 = RegExp(r'^\+[1-9][0-9]{7,14}$');
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    if (e164.hasMatch(trimmed) || RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) {
      return null;
    }
    return 'Use E.164 or a 10-digit mobile number';
  }

  String? _emailValidator(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return null;
    }
    if (!trimmed.contains('@') || !trimmed.contains('.')) {
      return 'Enter a valid email';
    }
    return null;
  }
}
