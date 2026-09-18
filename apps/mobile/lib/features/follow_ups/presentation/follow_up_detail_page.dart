import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../leads/domain/lead.dart';
import '../application/follow_up_providers.dart';
import 'follow_up_widgets.dart';

class FollowUpDetailPage extends ConsumerStatefulWidget {
  const FollowUpDetailPage({super.key, required this.followUpId});

  final String followUpId;

  @override
  ConsumerState<FollowUpDetailPage> createState() => _FollowUpDetailPageState();
}

class _FollowUpDetailPageState extends ConsumerState<FollowUpDetailPage> {
  LeadFollowUp? _item;
  Failure? _failure;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    final result = await ref.read(followUpRepositoryProvider).getById(widget.followUpId);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (result is Success) {
        _item = result.value;
      } else if (result is Err) {
        _failure = result.failure;
      }
    });
  }

  Future<void> _complete() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final notes = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.completeFollowUp),
          content: AppTextField(controller: notes, label: AppStrings.followUpNotes, maxLines: 3),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = notes.text.trim();
    notes.dispose();
    if (saved != true) {
      return;
    }
    final result = await ref.read(followUpRepositoryProvider).complete(
      id: item.id,
      version: item.version,
      notes: text,
    );
    if (result is Success) {
      await ref.read(followUpListProvider.notifier).refresh();
      await _reload();
    } else if (result is Err && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _reschedule() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final date = await showDatePicker(
      context: context,
      initialDate: item.dueAt.toLocal(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(item.dueAt.toLocal()),
    );
    if (time == null || !mounted) {
      return;
    }
    final dueAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final reason = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.rescheduleFollowUp),
          content: AppTextField(controller: reason, label: AppStrings.rescheduleReason, maxLines: 2),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = reason.text.trim();
    reason.dispose();
    if (saved != true) {
      return;
    }
    final result = await ref.read(followUpRepositoryProvider).reschedule(
      id: item.id,
      dueAt: dueAt,
      version: item.version,
      reason: text,
    );
    if (result is Success) {
      await ref.read(followUpListProvider.notifier).refresh();
      await _reload();
    } else if (result is Err && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    final item = _item;
    return AppScaffold(
      title: AppStrings.followUp,
      body: _loading
          ? const AppLoading()
          : _failure != null
          ? AppErrorView(failure: _failure!)
          : item == null
          ? const Center(child: Text('Follow-up not found'))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(followUpTypeIcon(item.type)),
                  title: Text(item.title),
                  subtitle: Text(FollowUpTypes.title(item.type)),
                ),
                Text(
                  [
                    if (item.overdue) AppStrings.overdue else item.status,
                    item.dueAt.toLocal().toString().substring(0, 16),
                    if (item.assigneeName != null) item.assigneeName!,
                  ].join(' · '),
                ),
                if (item.leadId != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.leadTitle ?? AppStrings.leads),
                    subtitle: Text(item.leadNumber ?? ''),
                    onTap: () => context.push(AppRoutes.leadDetailPath(item.leadId!)),
                  ),
                ],
                if (item.notes != null && item.notes!.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  Text(item.notes!),
                ],
                if (item.rescheduleCount > 0) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text('Rescheduled ${item.rescheduleCount} time(s)'),
                ],
                const SizedBox(height: AppSpacing.lg),
                if (item.isPending && user?.canUpdateFollowUp == true) ...[
                  AppButton(
                    label: AppStrings.editFollowUp,
                    onPressed: () async {
                      await context.push(AppRoutes.followUpEditPath(item.id));
                      await _reload();
                    },
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: AppStrings.rescheduleFollowUp,
                    onPressed: _reschedule,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
                if (item.isPending && user?.canCompleteFollowUp == true)
                  AppButton(
                    label: AppStrings.completeFollowUp,
                    onPressed: _complete,
                  ),
              ],
            ),
    );
  }
}
