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
import '../../leads/application/lead_list_controller.dart';
import '../../leads/domain/lead.dart';
import '../application/device_location.dart';
import '../application/site_visit_providers.dart';
import '../domain/site_visit.dart';

class SiteVisitFormPage extends ConsumerStatefulWidget {
  const SiteVisitFormPage({super.key, this.leadId, this.visitId});

  final String? leadId;

  /// When set, the page edits this visit (PATCH) instead of creating one.
  final String? visitId;

  @override
  ConsumerState<SiteVisitFormPage> createState() => _SiteVisitFormPageState();
}

class _SiteVisitFormPageState extends ConsumerState<SiteVisitFormPage> {
  final _purpose = TextEditingController();
  final _notes = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  String? _leadId;
  DateTime? _scheduledAt;
  GeoPoint? _location;
  var _saving = false;
  SiteVisit? _existing;
  String? _assigneeId;
  List<LeadStaffOption> _staff = const [];
  var _loadingExisting = false;

  bool get _isEdit => widget.visitId != null;

  @override
  void initState() {
    super.initState();
    _leadId = widget.leadId;
    _scheduledAt = DateTime.now().add(const Duration(hours: 2));
    if (_isEdit) {
      _loadingExisting = true;
      Future.microtask(_loadExisting);
    } else {
      Future.microtask(() => ref.read(leadListControllerProvider.notifier).refresh());
    }
  }

  Future<void> _loadExisting() async {
    final result = await ref.read(siteVisitApiProvider).getById(widget.visitId!);
    final lookups = await ref.read(leadRepositoryProvider).lookups();
    if (!mounted) {
      return;
    }
    setState(() {
      _loadingExisting = false;
      if (lookups is Success<LeadLookups>) {
        _staff = lookups.value.staff;
      }
      if (result is Success) {
        final visit = result.value.data;
        _existing = visit;
        _leadId = visit.leadId;
        _scheduledAt = visit.scheduledAt.toLocal();
        _purpose.text = visit.purpose ?? '';
        _notes.text = visit.notes ?? '';
        _address.text = visit.addressLine1 ?? '';
        _city.text = visit.city ?? '';
        _assigneeId = visit.assignedToMembershipId.isEmpty ? null : visit.assignedToMembershipId;
      } else if (result is Err) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.failure.message)),
        );
      }
    });
  }

  @override
  void dispose() {
    _purpose.dispose();
    _notes.dispose();
    _address.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _pickWhen() async {
    final now = DateTime.now();
    final current = _scheduledAt ?? now.add(const Duration(hours: 2));
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: current.isBefore(now) ? current : now,
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt ?? DateTime.now()),
    );
    if (time == null) {
      return;
    }
    setState(() {
      _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _captureGps() async {
    final point = await DeviceLocation.current();
    if (!mounted) {
      return;
    }
    if (point == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Location unavailable. Enable GPS and try again.')),
      );
      return;
    }
    setState(() => _location = point);
  }

  Future<void> _update(SiteVisit visit) async {
    final when = _scheduledAt;
    setState(() => _saving = true);
    final result = await ref.read(siteVisitApiProvider).updateVisit(
      id: visit.id,
      version: visit.version,
      scheduledAt: when,
      purpose: _purpose.text.trim(),
      notes: _notes.text.trim(),
      addressLine1: _address.text.trim(),
      city: _city.text.trim(),
      assignedToMembershipId:
          _assigneeId == visit.assignedToMembershipId ? null : _assigneeId,
      scheduledLocation: _location,
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

  Future<void> _save() async {
    final existing = _existing;
    if (existing != null) {
      return _update(existing);
    }
    final leadId = _leadId;
    final when = _scheduledAt;
    if (leadId == null || when == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead and schedule time are required.')),
      );
      return;
    }
    setState(() => _saving = true);
    final result = await ref.read(siteVisitApiProvider).create(
      leadId: leadId,
      scheduledAt: when,
      purpose: _purpose.text.trim(),
      notes: _notes.text.trim(),
      addressLine1: _address.text.trim(),
      city: _city.text.trim(),
      scheduledLocation: _location,
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
    if (_loadingExisting) {
      return const AppScaffold(title: AppStrings.editSiteVisit, body: AppLoading());
    }
    final staffIds = {for (final option in _staff) option.id};
    return AppScaffold(
      title: _isEdit ? AppStrings.editSiteVisit : AppStrings.scheduleVisit,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          if (_isEdit && _staff.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: staffIds.contains(_assigneeId) ? _assigneeId : null,
              decoration: const InputDecoration(labelText: AppStrings.assignedStaff),
              items: [
                for (final option in _staff)
                  DropdownMenuItem(value: option.id, child: Text(option.fullName)),
              ],
              onChanged: (value) => setState(() => _assigneeId = value),
            ),
          if (widget.leadId == null && !_isEdit)
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
          AppTextField(controller: _purpose, label: AppStrings.visitPurpose),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.scheduledAt),
            subtitle: Text(_scheduledAt?.toLocal().toString().substring(0, 16) ?? '—'),
            trailing: const Icon(Icons.event),
            onTap: _pickWhen,
          ),
          AppTextField(controller: _address, label: AppStrings.address),
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _city, label: AppStrings.city),
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _notes, label: AppStrings.activityNotes, maxLines: 3),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(AppStrings.gpsLocation),
            subtitle: Text(_location?.label ?? 'Optional planned location'),
            trailing: TextButton(onPressed: _captureGps, child: const Text('Capture')),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (_saving)
            const AppLoading()
          else
            AppButton(
              label: _isEdit ? AppStrings.save : AppStrings.scheduleVisit,
              onPressed: _isEdit && _existing == null ? null : _save,
            ),
        ],
      ),
    );
  }
}
