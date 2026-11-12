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
import '../../pipeline/application/pipeline_providers.dart';
import '../../pipeline/domain/pipeline_models.dart';
import '../../pipeline/presentation/mark_lost_dialog.dart';
import '../application/quotation_providers.dart';
import '../domain/quotation.dart';

class QuotationDetailPage extends ConsumerStatefulWidget {
  const QuotationDetailPage({super.key, required this.quotationId});

  final String quotationId;

  @override
  ConsumerState<QuotationDetailPage> createState() => _QuotationDetailPageState();
}

class _QuotationDetailPageState extends ConsumerState<QuotationDetailPage> {
  Quotation? _item;
  Failure? _failure;
  var _loading = true;
  var _busy = false;

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
    final result = await ref.read(quotationApiProvider).getById(widget.quotationId);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (result is Success) {
        _item = result.value.data;
      } else if (result is Err) {
        _failure = result.failure;
      }
    });
  }

  Future<void> _run(Future<Result<dynamic>> Function() action) async {
    setState(() => _busy = true);
    final result = await action();
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is Success) {
      await _reload();
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _send() async {
    final item = _item;
    if (item == null) {
      return;
    }
    await _run(
      () => ref.read(quotationApiProvider).send(id: item.id, version: item.version),
    );
  }

  Future<void> _scheduleReminder() async {
    final item = _item;
    if (item == null) {
      return;
    }
    DateTime when = DateTime.now().add(const Duration(days: 2));
    DateTime? close = item.expectedCloseOn == null
        ? DateTime.now().add(const Duration(days: 14))
        : DateTime.tryParse(item.expectedCloseOn!);
    final picked = await showDatePicker(
      context: context,
      initialDate: when,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) {
      return;
    }
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(when));
    if (time == null || !mounted) {
      return;
    }
    when = DateTime(picked.year, picked.month, picked.day, time.hour, time.minute);
    final closePicked = await showDatePicker(
      context: context,
      initialDate: close ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (closePicked != null) {
      close = closePicked;
    }
    await _run(
      () => ref.read(quotationApiProvider).scheduleFollowUp(
        id: item.id,
        version: item.version,
        nextFollowUpAt: when,
        expectedCloseOn: close?.toIso8601String().substring(0, 10),
      ),
    );
  }

  Future<void> _logFollowUp() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final note = TextEditingController(text: item.followUpNote ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.logFollowUp),
          content: AppTextField(controller: note, label: AppStrings.activityNotes, maxLines: 3),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = note.text.trim();
    note.dispose();
    if (saved != true) {
      return;
    }
    await _run(
      () => ref.read(quotationApiProvider).scheduleFollowUp(
        id: item.id,
        version: item.version,
        note: text,
        logged: true,
      ),
    );
  }

  Future<void> _deleteLine(QuotationItem line) async {
    final item = _item;
    if (item == null) {
      return;
    }
    final remaining = [
      for (final row in item.items)
        if (row.id != line.id)
          {
            if (row.productId != null) 'productId': row.productId,
            'description': row.description,
            'quantity': row.quantity,
            'unitPriceMinor': row.unitPriceMinor,
            'discountMinor': row.discountMinor,
            if (row.taxRateIds.isNotEmpty) 'taxRateIds': row.taxRateIds,
            if (row.taxRateIds.isEmpty) 'taxBps': row.taxBps,
          },
    ];
    if (remaining.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Keep at least one line item')),
      );
      return;
    }
    await _run(
      () => ref.read(quotationApiProvider).update(
        id: item.id,
        version: item.version,
        items: remaining,
      ),
    );
  }

  Future<void> _deleteQuotation() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.deleteQuotation),
          content: const Text('Delete this draft quotation?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
          ],
        );
      },
    );
    if (confirmed != true) {
      return;
    }
    setState(() => _busy = true);
    final result = await ref.read(quotationApiProvider).remove(item.id);
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is Success) {
      context.pop(true);
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _changeStatus(String status) async {
    final item = _item;
    if (item == null) {
      return;
    }
    String? reason;
    if (status == QuotationStatuses.lost) {
      final controller = TextEditingController(text: item.lostReason ?? '');
      final saved = await showDialog<bool>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text(AppStrings.markLost),
            content: AppTextField(
              controller: controller,
              label: AppStrings.lossReason,
              maxLines: 3,
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
            ],
          );
        },
      );
      reason = controller.text.trim();
      controller.dispose();
      if (saved != true || reason.isEmpty) {
        return;
      }
    }
    await _run(
      () => ref.read(quotationApiProvider).changeStatus(
        id: item.id,
        status: status,
        version: item.version,
        reason: reason,
      ),
    );
    if (!mounted) {
      return;
    }
    final updated = _item;
    if (status == QuotationStatuses.won && updated?.leadLifecycleStatus == 'won') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Quotation won — lead moved to Won')),
      );
    }
    // A rejected quotation may be re-quoted, so the lead isn't closed
    // automatically; offer it instead.
    if (status == QuotationStatuses.lost &&
        updated?.status == QuotationStatuses.lost &&
        updated?.leadLifecycleStatus == 'open' &&
        ref.read(authControllerProvider).user?.canChangeStage == true) {
      await _offerMarkLeadLost(updated!, reason);
    }
  }

  Future<void> _offerMarkLeadLost(Quotation item, String? reason) async {
    final boardResult = unwrapPipeline<PipelineBoard>(
      await ref.read(pipelineApiProvider).board(),
    );
    if (!mounted || boardResult is! Success<PipelineBoard>) {
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
      return;
    }
    final input = await showMarkLostDialog(
      context,
      board.lossReasons,
      initialNotes: reason,
      intro:
          '${item.quotationNumber} is marked lost. Close lead ${item.leadNumber ?? ''} '
          'as lost too? Cancel to keep it open for a revised quotation.',
    );
    if (input == null || !mounted) {
      return;
    }
    final result = unwrapPipeline<PipelineCard>(
      await ref.read(pipelineApiProvider).changeStage(
        leadId: item.leadId,
        stageId: lostStage.id,
        lostReasonId: input.lostReasonId,
        lostNotes: input.notes,
      ),
    );
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result is Err ? (result as Err).failure.message : AppStrings.markedAsLost,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final user = ref.watch(authControllerProvider).user;
    if (_loading) {
      return const AppScaffold(title: AppStrings.quotation, body: AppLoading());
    }
    if (_failure != null || item == null) {
      return AppScaffold(
        title: AppStrings.quotation,
        body: AppErrorView(failure: _failure ?? const UnexpectedFailure('Quotation not found')),
      );
    }
    final next = [
      for (final status in item.nextStatuses)
        if (status != QuotationStatuses.sent) status,
    ];
    return AppScaffold(
      title: item.quotationNumber,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Text(item.displayTitle, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.xs),
          Text(
            [
              QuotationStatuses.title(item.status),
              item.totalLabel,
              if (item.customerName != null) item.customerName!,
              if (item.assigneeName != null) item.assigneeName!,
            ].join(' · '),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final status in QuotationStatuses.all)
                Chip(
                  label: Text(QuotationStatuses.title(status)),
                  backgroundColor: status == item.status
                      ? Theme.of(context).colorScheme.primaryContainer
                      : null,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Closing prediction', style: Theme.of(context).textTheme.titleMedium),
          if (item.closingPrediction != null) ...[
            Text(item.predictionLabel),
            const SizedBox(height: AppSpacing.xs),
            LinearProgressIndicator(value: item.closingPrediction!.fraction),
            for (final reason in item.closingPrediction!.reasons.take(3)) Text('• $reason'),
          ],
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.expectedCloseDate, style: Theme.of(context).textTheme.titleSmall),
          Text(item.expectedCloseOn ?? 'Not set'),
          Text(AppStrings.nextReminder, style: Theme.of(context).textTheme.titleSmall),
          Text(
            item.nextFollowUpAt == null
                ? 'No reminder scheduled'
                : item.nextFollowUpAt!.toLocal().toString().substring(0, 16),
          ),
          if (item.followUpNote?.trim().isNotEmpty == true) Text(item.followUpNote!),
          const SizedBox(height: AppSpacing.lg),
          Text(AppStrings.lineItems, style: Theme.of(context).textTheme.titleMedium),
          if (item.items.isEmpty) const Text('No line items'),
          for (final line in item.items)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(line.description),
                      subtitle: Text(
                        [
                          if (line.productName != null) line.productName!,
                          'Qty ${line.quantity}',
                          minorToRupeesLabel(line.unitPriceMinor),
                          if (line.taxBps > 0) '${(line.taxBps / 100).toStringAsFixed(0)}% tax',
                        ].join(' · '),
                      ),
                      trailing: Text(minorToRupeesLabel(line.lineTotalMinor)),
                    ),
                    if (item.isDraft && user?.canCreateQuotation == true)
                      Row(
                        children: [
                          TextButton(
                            onPressed: () async {
                              await context.push(AppRoutes.quotationEditPath(item.id));
                              await _reload();
                            },
                            child: const Text(AppStrings.editLine),
                          ),
                          TextButton(
                            onPressed: item.items.length == 1
                                ? null
                                : () => _deleteLine(line),
                            child: const Text(AppStrings.deleteLine),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          Text('Subtotal ${minorToRupeesLabel(item.subtotalMinor)}'),
          Text('Discount ${minorToRupeesLabel(item.discountMinor)}'),
          Text('Tax ${minorToRupeesLabel(item.taxMinor)}'),
          Text('Total ${item.totalLabel}', style: Theme.of(context).textTheme.titleMedium),
          if (item.notes?.trim().isNotEmpty == true) ...[
            const SizedBox(height: AppSpacing.md),
            Text(AppStrings.activityNotes, style: Theme.of(context).textTheme.titleSmall),
            Text(item.notes!),
          ],
          if (item.lostReason?.trim().isNotEmpty == true) ...[
            const SizedBox(height: AppSpacing.md),
            Text(AppStrings.lossReason, style: Theme.of(context).textTheme.titleSmall),
            Text(item.lostReason!),
          ],
          const SizedBox(height: AppSpacing.lg),
          if (_busy) const AppLoading(),
          if (!_busy && item.isDraft && user?.canCreateQuotation == true) ...[
            AppButton(
              label: AppStrings.editQuotation,
              onPressed: () async {
                await context.push(AppRoutes.quotationEditPath(item.id));
                await _reload();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (!_busy && item.isDraft && user?.canDeleteQuotation == true) ...[
            AppButton(
              label: AppStrings.deleteQuotation,
              onPressed: _deleteQuotation,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (!_busy && item.isDraft && user?.canSendQuotation == true)
            AppButton(label: AppStrings.sendQuotation, onPressed: _send),
          if (!_busy && item.isPending && user?.canSendQuotation == true) ...[
            AppButton(label: AppStrings.logFollowUp, onPressed: _logFollowUp),
            const SizedBox(height: AppSpacing.sm),
            AppButton(label: AppStrings.scheduleReminder, onPressed: _scheduleReminder),
          ],
          if (!_busy &&
              user?.canCreateWarranty == true &&
              (item.status == QuotationStatuses.approved || item.status == QuotationStatuses.won)) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: AppStrings.issueWarranty,
              onPressed: () async {
                await context.push(
                  AppRoutes.warrantyCreatePath(leadId: item.leadId, quotationId: item.id),
                );
              },
            ),
          ],
          if (!_busy && user?.canAcceptQuotation == true)
            for (final status in next) ...[
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: status == QuotationStatuses.lost
                    ? AppStrings.markLost
                    : status == QuotationStatuses.won
                    ? AppStrings.markWon
                    : 'Move to ${QuotationStatuses.title(status)}',
                onPressed: () => _changeStatus(status),
              ),
            ],
        ],
      ),
    );
  }
}
