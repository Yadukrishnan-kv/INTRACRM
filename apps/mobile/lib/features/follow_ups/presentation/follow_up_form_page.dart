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
import '../application/follow_up_providers.dart';
import 'follow_up_widgets.dart';

class FollowUpFormPage extends ConsumerStatefulWidget {
  const FollowUpFormPage({super.key, this.followUpId, this.leadId});

  final String? followUpId;
  final String? leadId;

  @override
  ConsumerState<FollowUpFormPage> createState() => _FollowUpFormPageState();
}

class _FollowUpFormPageState extends ConsumerState<FollowUpFormPage> {
  final _notes = TextEditingController();
  final _title = TextEditingController();
  String _type = FollowUpTypes.call;
  DateTime? _dueAt;
  String? _leadId;
  int _version = 1;
  var _loading = false;
  var _saving = false;

  bool get _isEdit => widget.followUpId != null;

  @override
  void initState() {
    super.initState();
    _leadId = widget.leadId;
    _dueAt = DateTime.now().add(const Duration(days: 1));
    if (_isEdit) {
      _load();
    } else {
      Future.microtask(() => ref.read(leadListControllerProvider.notifier).refresh());
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    _title.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final result = await ref.read(followUpRepositoryProvider).getById(widget.followUpId!);
    if (!mounted) {
      return;
    }
    if (result is Success) {
      final item = result.value;
      _type = item.type;
      _title.text = item.title;
      _notes.text = item.notes ?? '';
      _dueAt = item.dueAt.toLocal();
      _leadId = item.leadId;
      _version = item.version;
    }
    setState(() => _loading = false);
  }

  Future<void> _pickDue() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _dueAt ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _dueAt ?? DateTime.now().add(const Duration(hours: 1)),
      ),
    );
    if (time == null || !mounted) {
      return;
    }
    setState(() {
      _dueAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submit() async {
    final leadId = _leadId;
    final dueAt = _dueAt;
    if (leadId == null || dueAt == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead and due date are required')),
      );
      return;
    }
    setState(() => _saving = true);
    final api = ref.read(followUpRepositoryProvider);
    final result = _isEdit
        ? await api.update(
            id: widget.followUpId!,
            version: _version,
            type: _type,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
          )
        : await api.create(
            leadId: leadId,
            type: _type,
            dueAt: dueAt,
            title: _title.text.trim(),
            notes: _notes.text.trim(),
          );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Success) {
      await ref.read(followUpListProvider.notifier).refresh();
      context.pop(true);
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final leads = ref.watch(leadListControllerProvider).value;
    final leadOptions = leads?.valueOrNull?.items ?? const <Lead>[];
    return AppScaffold(
      title: _isEdit ? AppStrings.editFollowUp : AppStrings.createFollowUp,
      body: _loading
          ? const AppLoading()
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(AppStrings.followUpType, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.sm),
                FollowUpTypeChips(
                  value: _type,
                  onChanged: (value) => setState(() => _type = value),
                ),
                if (!_isEdit && widget.leadId == null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  DropdownButtonFormField<String>(
                    initialValue: _leadId,
                    decoration: const InputDecoration(labelText: AppStrings.leads),
                    items: [
                      for (final lead in leadOptions)
                        DropdownMenuItem(
                          value: lead.id,
                          child: Text('${lead.leadNumber} · ${lead.displayName}'),
                        ),
                    ],
                    onChanged: (value) => setState(() => _leadId = value),
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  controller: _title,
                  label: AppStrings.followUp,
                ),
                if (!_isEdit) ...[
                  const SizedBox(height: AppSpacing.sm),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      _dueAt == null
                          ? AppStrings.dueAt
                          : _dueAt!.toLocal().toString().substring(0, 16),
                    ),
                    trailing: const Icon(Icons.event),
                    onTap: _pickDue,
                  ),
                ],
                AppTextField(
                  controller: _notes,
                  label: AppStrings.followUpNotes,
                  maxLines: 3,
                ),
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                  label: _isEdit ? AppStrings.editFollowUp : AppStrings.createFollowUp,
                  loading: _saving,
                  onPressed: _submit,
                ),
              ],
            ),
    );
  }
}
