import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/components/confirm_dialog.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../features/auth/domain/auth_user.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../billing/presentation/lead_billing_panel.dart';
import '../../comms/presentation/lead_comms_bar.dart';
import '../../follow_ups/presentation/follow_up_widgets.dart';
import '../../pipeline/application/pipeline_providers.dart';
import '../../pipeline/domain/pipeline_models.dart';
import '../../pipeline/presentation/mark_lost_dialog.dart';
import '../../settings/application/sync_controller.dart';
import '../../timeline/application/timeline_providers.dart';
import '../../timeline/domain/timeline_models.dart';
import '../../timeline/presentation/timeline_page.dart';
import '../../tracks/presentation/lead_audit_trail.dart';
import '../application/lead_list_controller.dart';
import '../domain/lead.dart';

class LeadDetailPage extends ConsumerStatefulWidget {
  const LeadDetailPage({super.key, required this.leadId});

  final String leadId;

  @override
  ConsumerState<LeadDetailPage> createState() => _LeadDetailPageState();
}

class _LeadDetailPageState extends ConsumerState<LeadDetailPage> {
  Lead? _lead;
  List<StageChange> _history = const [];
  List<TimelineEvent> _timeline = const [];
  Failure? _failure;
  var _loading = true;
  var _deleting = false;
  var _tab = 0;
  List<PipelineStage> _stages = const [];

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
    final result = await ref.read(leadRepositoryProvider).getById(widget.leadId);
    Result<List<StageChange>> history = const Success([]);
    Result<ApiSuccess<List<TimelineEvent>>>? timeline;
    Result<PipelineBoard>? board;
    if (ref.read(syncControllerProvider).online) {
      history = unwrapPipeline<List<StageChange>>(
        await ref.read(pipelineApiProvider).history(widget.leadId),
      );
      timeline = await ref.read(timelineApiProvider).list(leadId: widget.leadId);
      board = unwrapPipeline<PipelineBoard>(
        await ref.read(pipelineApiProvider).board(),
      );
    }
    if (!mounted) {
      return;
    }
    result.when(
      success: (lead) => setState(() {
        _lead = lead;
        _history = history is Success<List<StageChange>> ? history.value : const [];
        _timeline = timeline?.valueOrNull?.data ?? [
                for (final item in lead.activities)
                  TimelineEvent(
                    id: item.id,
                    eventCode: item.type,
                    title: item.subject ?? item.type,
                    occurredAt: item.occurredAt,
                    leadId: lead.id,
                    leadNumber: lead.leadNumber,
                    leadTitle: lead.title,
                    body: item.body,
                    actorName: item.actorName,
                    customerName: lead.customerName,
                  ),
              ];
        _stages = board is Success<PipelineBoard>
            ? [for (final column in board.value.columns) column.stage]
            : _stages;
        _loading = false;
      }),
      failure: (failure) => setState(() {
        _failure = failure;
        _loading = false;
      }),
    );
  }

  Future<void> _assign() async {
    final lookups = await ref.read(leadRepositoryProvider).lookups();
    if (!mounted || lookups is! Success<LeadLookups>) {
      return;
    }
    String? selected = _lead?.ownerMembershipId ??
        (lookups.value.staff.isEmpty ? null : lookups.value.staff.first.id);
    final confirmed = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.assignedStaff),
          content: DropdownButtonFormField<String>(
            initialValue: selected,
            items: [
              for (final staff in lookups.value.staff)
                DropdownMenuItem(value: staff.id, child: Text(staff.fullName)),
            ],
            onChanged: (value) => selected = value,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, selected),
              child: const Text('Assign'),
            ),
          ],
        );
      },
    );
    if (confirmed == null) {
      return;
    }
    final result = await ref.read(leadRepositoryProvider).assign(
      id: widget.leadId,
      ownerMembershipId: confirmed,
    );
    if (!mounted) {
      return;
    }
    result.when(
      success: (lead) => setState(() => _lead = lead),
      failure: (failure) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(failure.message)),
      ),
    );
  }

  Future<void> _addActivity() async {
    final body = TextEditingController();
    var type = 'note';
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.addActivity),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: type,
                items: const [
                  DropdownMenuItem(value: 'note', child: Text('Note')),
                  DropdownMenuItem(value: 'call', child: Text('Call')),
                  DropdownMenuItem(value: 'email', child: Text('Email')),
                  DropdownMenuItem(value: 'meeting', child: Text('Meeting')),
                  DropdownMenuItem(value: 'sms', child: Text('SMS')),
                  DropdownMenuItem(value: 'whatsapp', child: Text('WhatsApp')),
                ],
                onChanged: (value) => type = value ?? 'note',
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(controller: body, label: AppStrings.activityNotes, maxLines: 3),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final notes = body.text.trim();
    body.dispose();
    if (saved != true || notes.isEmpty) {
      return;
    }
    final result = await ref.read(leadRepositoryProvider).addActivity(
      leadId: widget.leadId,
      type: type,
      body: notes,
    );
    if (result is Success) {
      await _reload();
    } else if (result is Err && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _sendQuotation() async {
    await context.push(AppRoutes.quotationCreatePath(leadId: widget.leadId));
    await _reload();
  }

  Future<void> _addSiteVisit() async {
    await context.push(AppRoutes.siteVisitCreatePath(leadId: widget.leadId));
    await _reload();
  }

  Future<void> _issueWarranty() async {
    await context.push(AppRoutes.warrantyCreatePath(leadId: widget.leadId));
    await _reload();
  }

  Future<void> _addFollowUp() async {
    await context.push(AppRoutes.followUpCreatePath(leadId: widget.leadId));
    await _reload();
  }

  Future<void> _changeStage() async {
    final boardResult = unwrapPipeline<PipelineBoard>(
      await ref.read(pipelineApiProvider).board(),
    );
    if (!mounted || boardResult is! Success<PipelineBoard> || _lead == null) {
      return;
    }
    final board = boardResult.value;
    String? selected = _lead!.stageId;
    // Lost has its own "Mark as Lost" action, so it is not offered here
    // (except as the current value when the lead is already lost).
    final options = [
      for (final column in board.columns)
        if (!column.stage.isLost || column.stage.id == selected) column.stage,
    ];
    if (!options.any((stage) => stage.id == selected)) {
      selected = options.isEmpty ? null : options.first.id;
    }
    final picked = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.changeStage),
          content: DropdownButtonFormField<String>(
            initialValue: selected,
            items: [
              for (final stage in options)
                DropdownMenuItem(value: stage.id, child: Text(stage.name)),
            ],
            onChanged: (value) => selected = value,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, selected),
              child: const Text('Move'),
            ),
          ],
        );
      },
    );
    if (picked == null || picked == _lead!.stageId) {
      return;
    }
    await _submitStageChange(stageId: picked);
  }

  /// Closes the lead as lost from whatever stage it is in, with a reason and
  /// a short summary of why.
  Future<void> _markLost() async {
    final boardResult = unwrapPipeline<PipelineBoard>(
      await ref.read(pipelineApiProvider).board(),
    );
    if (!mounted || boardResult is! Success<PipelineBoard> || _lead == null) {
      return;
    }
    final board = boardResult.value;
    PipelineStage? lostStage;
    for (final column in board.columns) {
      if (column.stage.isLost) {
        lostStage = column.stage;
        break;
      }
    }
    if (lostStage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No Lost stage is configured for this pipeline.')),
      );
      return;
    }
    final input = await showMarkLostDialog(context, board.lossReasons);
    if (input == null || !mounted) {
      return;
    }
    await _submitStageChange(
      stageId: lostStage.id,
      lostReasonId: input.lostReasonId,
      lostNotes: input.notes,
    );
  }

  Future<void> _submitStageChange({
    required String stageId,
    String? lostReasonId,
    String? lostNotes,
  }) async {
    final result = unwrapPipeline<PipelineCard>(
      await ref.read(pipelineApiProvider).changeStage(
        leadId: widget.leadId,
        stageId: stageId,
        version: _lead!.version,
        lostReasonId: lostReasonId,
        lostNotes: lostNotes,
      ),
    );
    if (result is Success) {
      if (lostReasonId != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.markedAsLost)),
        );
      }
      await _reload();
    } else if (result is Err && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _delete(Lead lead) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.deleteLead,
      message: AppStrings.deleteLeadMessage(lead.title),
      confirmLabel: AppStrings.deleteLead,
    );
    if (!confirmed || !mounted) {
      return;
    }
    setState(() => _deleting = true);
    final result = await ref.read(leadRepositoryProvider).delete(lead.id);
    if (!mounted) {
      return;
    }
    setState(() => _deleting = false);
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
      return;
    }
    await ref.read(leadListControllerProvider.notifier).refresh();
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(AppStrings.leadDeleted)),
    );
    context.pop();
  }

  Future<void> _complete(LeadFollowUp followUp) async {
    final result = await ref.read(leadRepositoryProvider).completeFollowUp(
      leadId: widget.leadId,
      followUpId: followUp.id,
    );
    if (result is Success) {
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
    final lead = _lead;
    return Scaffold(
      backgroundColor: context.palette.canvas,
      appBar: AppBar(
        title: const Text('Lead Details'),
        actions: [
          if (lead != null && user?.canUpdateLead == true)
            TextButton(
              onPressed: () async {
                await context.push(AppRoutes.leadEditPath(lead.id));
                await _reload();
              },
              child: Text('Edit'),
            ),
        ],
      ),
      body: _loading
          ? const AppLoading()
          : _failure != null
          ? AppErrorView(failure: _failure!)
          : lead == null
          ? const Center(child: Text('Lead not found'))
          : Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      children: [
                        _ProfileHeader(lead: lead),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            _detailTab('DETAILS', 0),
                            _detailTab('ACTIVITY', 1),
                            if (user?.canReadAudit == true) _detailTab(AppStrings.auditTab, 2),
                          ],
                        ),
                        const SizedBox(height: 12),
                        if (_deleting) const LinearProgressIndicator(),
                        switch (_tab) {
                          1 => _activityTab(context, lead),
                          2 when user?.canReadAudit == true => LeadAuditTrail(leadId: lead.id),
                          _ => _detailsTab(context, lead, user),
                        },
                      ],
                    ),
                  ),
                ),
                Material(
                  color: context.palette.card,
                  elevation: 8,
                  child: LeadCommsBar(
                    lead: lead,
                    onLogged: _reload,
                    dock: true,
                    onMore: () => _showMore(lead, user),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _detailTab(String label, int index) {
    final selected = _tab == index;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _tab = index),
        child: Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: selected ? AppColors.teal : context.palette.muted,
              ),
            ),
            const SizedBox(height: 8),
            Container(height: 2, color: selected ? AppColors.teal : Colors.transparent),
          ],
        ),
      ),
    );
  }

  Widget _detailsTab(BuildContext context, Lead lead, AuthUser? user) {
    final follow = lead.nextFollowUpAt?.toLocal();
    final quality = lead.quality ?? '—';
    final lost = lead.lifecycleStatus.toLowerCase().contains('lost');
    final won = lead.lifecycleStatus.toLowerCase().contains('won');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionCard(
          child: Column(
            children: [
              InfoRow(icon: Icons.campaign_outlined, label: AppStrings.leadSource, value: lead.sourceName ?? '—'),
              InfoRow(icon: Icons.person_outline, label: AppStrings.assignedStaff, value: lead.ownerName ?? 'Unassigned'),
              InfoRow(icon: Icons.inventory_2_outlined, label: 'Product Interest', value: lead.title),
              InfoRow(icon: Icons.notes_outlined, label: AppStrings.requirement, value: lead.requirement ?? '—'),
              InfoRow(icon: Icons.currency_rupee, label: 'Lead Value (Est.)', value: lead.valueLabel),
              InfoRow(
                icon: Icons.local_fire_department_outlined,
                label: AppStrings.leadQuality,
                value: quality,
                trailing: quality.toLowerCase() == 'hot'
                    ? const Icon(Icons.local_fire_department, color: Color(0xFFE65100))
                    : null,
              ),
              InfoRow(
                icon: Icons.event_outlined,
                label: 'Created On',
                value: _prettyDate(lead.createdAt ?? lead.updatedAt),
              ),
              InfoRow(
                icon: Icons.event_available_outlined,
                label: 'Next Follow-up',
                value: follow == null ? 'Not scheduled' : _prettyDate(follow),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Status Pipeline', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              PipelineStepper(
                stages: [
                  for (final stage in _stages)
                    if (!(stage.isLost && won) && !(stage.isWon && lost)) stage.name,
                ],
                current: lead.stageName ?? lead.lifecycleStatus,
                lost: lost,
              ),
              if (lost) ...[
                const SizedBox(height: 12),
                _LostSummary(lead: lead),
              ],
              if (user?.canChangeStage == true) ...[
                const SizedBox(height: 12),
                AppButton(
                  label: lost ? 'Reopen' : AppStrings.changeStage,
                  onPressed: _changeStage,
                ),
                if (!lost && !won && _stages.any((stage) => stage.isLost)) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Theme.of(context).colorScheme.error,
                        side: BorderSide(color: Theme.of(context).colorScheme.error),
                      ),
                      onPressed: _markLost,
                      icon: const Icon(Icons.thumb_down_alt_outlined),
                      label: const Text(AppStrings.markAsLost),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
        if (lead.followUps.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(AppStrings.followUp, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                for (final item in lead.followUps)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(followUpTypeIcon(item.type), color: item.overdue ? AppColors.danger : AppColors.teal),
                    title: Text(item.title),
                    subtitle: Text(
                      [
                        FollowUpTypes.title(item.type),
                        if (item.overdue) AppStrings.overdue else item.status,
                        item.dueAt.toLocal().toString().substring(0, 16),
                      ].join(' · '),
                    ),
                    trailing: item.isPending && user?.canCompleteFollowUp == true
                        ? TextButton(
                            onPressed: () => _complete(item),
                            child: const Text(AppStrings.completeFollowUp),
                          )
                        : null,
                    onTap: () async {
                      await context.push(AppRoutes.followUpDetailPath(item.id));
                      await _reload();
                    },
                  ),
              ],
            ),
          ),
        ],
        if (user?.canReadBilling == true) ...[
          const SizedBox(height: 12),
          LeadBillingPanel(leadId: lead.id),
        ],
      ],
    );
  }

  Widget _activityTab(BuildContext context, Lead lead) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_timeline.isEmpty)
          const SectionCard(child: Text('No timeline events yet'))
        else
          for (final item in _timeline) ...[
            TimelineTile(event: item, showLead: false),
            const SizedBox(height: 8),
          ],
        if (_history.isNotEmpty) ...[
          const SizedBox(height: 8),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Stage history', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                for (final item in _history)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      item.fromStageName == null
                          ? item.toStageName
                          : '${item.fromStageName} → ${item.toStageName}',
                    ),
                    subtitle: Text(
                      [
                        item.toLifecycleStatus,
                        if (item.changedByName != null) item.changedByName!,
                        item.changedAt.toLocal().toString(),
                      ].join(' · '),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _showMore(Lead lead, AuthUser? user) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (user?.canAssignLead == true)
                ListTile(
                  leading: const Icon(Icons.person_add_alt),
                  title: const Text(AppStrings.reassignStaff),
                  onTap: () {
                    Navigator.pop(context);
                    _assign();
                  },
                ),
              if (user?.canCreateFollowUp == true)
                ListTile(
                  leading: const Icon(Icons.event_available_outlined),
                  title: const Text(AppStrings.scheduleFollowUp),
                  onTap: () {
                    Navigator.pop(context);
                    _addFollowUp();
                  },
                ),
              if (user?.canCreateActivity == true)
                ListTile(
                  leading: const Icon(Icons.note_add_outlined),
                  title: const Text(AppStrings.addActivity),
                  onTap: () {
                    Navigator.pop(context);
                    _addActivity();
                  },
                ),
              if (user?.canCreateQuotation == true)
                ListTile(
                  leading: const Icon(Icons.request_quote_outlined),
                  title: const Text(AppStrings.createQuotation),
                  onTap: () {
                    Navigator.pop(context);
                    _sendQuotation();
                  },
                ),
              if (user?.canCreateSiteVisit == true)
                ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: const Text(AppStrings.addSiteVisit),
                  onTap: () {
                    Navigator.pop(context);
                    _addSiteVisit();
                  },
                ),
              if (user?.canCreateWarranty == true)
                ListTile(
                  leading: const Icon(Icons.verified_outlined),
                  title: const Text(AppStrings.issueWarranty),
                  onTap: () {
                    Navigator.pop(context);
                    _issueWarranty();
                  },
                ),
              if (user?.canCreateActivity == true)
                LeadCommsBar(lead: lead, onLogged: _reload),
              if (user?.canDeleteLead == true)
                ListTile(
                  leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
                  title: Text(
                    AppStrings.deleteLead,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _delete(lead);
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  String _prettyDate(DateTime value) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final local = value.toLocal();
    return '${local.day.toString().padLeft(2, '0')} ${months[local.month - 1]} ${local.year}';
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        InitialsAvatar(name: lead.displayName, size: 72),
        SizedBox(height: 10),
        Text(lead.displayName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        StatusBadge(label: lead.stageName ?? lead.lifecycleStatus),
        const SizedBox(height: 8),
        if (lead.primaryPhone != null && lead.primaryPhone!.isNotEmpty)
          Text(lead.primaryPhone!, style: TextStyle(color: context.palette.muted)),
        if (lead.city != null && lead.city!.isNotEmpty)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.place_outlined, size: 14, color: context.palette.muted),
              SizedBox(width: 4),
              Text(lead.city!, style: TextStyle(color: context.palette.muted)),
            ],
          ),
        if (lead.isPendingSync || lead.hasConflict)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Chip(
              avatar: Icon(lead.hasConflict ? Icons.merge_type : Icons.cloud_off, size: 16),
              label: Text(lead.hasConflict ? AppStrings.syncConflict : AppStrings.queuedOffline),
            ),
          ),
      ],
    );
  }
}

/// Loss reason + notes shown on the Status Pipeline card for lost leads.
class _LostSummary extends StatelessWidget {
  const _LostSummary({required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final notes = lead.lostNotes;
    final lostAt = lead.lostAt?.toLocal();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: scheme.error, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Why it was lost',
            style: theme.textTheme.titleSmall?.copyWith(
              color: scheme.error,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${AppStrings.lossReason}: ${lead.lostReasonName ?? '—'}',
            style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          if (lostAt != null)
            Text(
              'Marked lost ${MaterialLocalizations.of(context).formatMediumDate(lostAt)}',
              style: theme.textTheme.bodySmall,
            ),
          const SizedBox(height: 6),
          Text(
            notes == null || notes.isEmpty ? 'No notes recorded.' : notes,
            style: theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
