import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/pipeline_providers.dart';
import '../domain/pipeline_models.dart';

class PipelineBoardPage extends ConsumerStatefulWidget {
  const PipelineBoardPage({super.key});

  @override
  ConsumerState<PipelineBoardPage> createState() => _PipelineBoardPageState();
}

class _PipelineBoardPageState extends ConsumerState<PipelineBoardPage> {
  PipelineBoard? _board;
  var _loading = true;
  String? _error;
  String? _movingId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = unwrapPipeline<PipelineBoard>(
      await ref.read(pipelineApiProvider).board(),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _board = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _move(PipelineCard card, PipelineStage stage) async {
    if (card.stageId == stage.id || _movingId != null) {
      return;
    }
    String? lostReasonId;
    if (stage.isLost) {
      lostReasonId = await _pickLossReason();
      if (lostReasonId == null) {
        return;
      }
    }
    setState(() => _movingId = card.id);
    final result = unwrapPipeline<PipelineCard>(
      await ref.read(pipelineApiProvider).changeStage(
        leadId: card.id,
        stageId: stage.id,
        version: card.version,
        lostReasonId: lostReasonId,
      ),
    );
    if (!mounted) {
      return;
    }
    setState(() => _movingId = null);
    switch (result) {
      case Success():
        await _load();
      case Err(:final failure):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message)),
        );
        await _load();
    }
  }

  Future<String?> _pickLossReason() async {
    final reasons = _board?.lossReasons ?? const <LossReason>[];
    if (reasons.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a loss reason before marking Lost.')),
      );
      return null;
    }
    String selected = reasons.first.id;
    return showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.lossReason),
          content: DropdownButtonFormField<String>(
            initialValue: selected,
            items: [
              for (final reason in reasons)
                DropdownMenuItem(value: reason.id, child: Text(reason.name)),
            ],
            onChanged: (value) => selected = value ?? selected,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, selected),
              child: const Text('Mark lost'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final board = _board;
    return AppScaffold(
      title: board?.pipelineName ?? AppStrings.pipeline,
      actions: [
        IconButton(
          tooltip: AppStrings.conversionAnalytics,
          onPressed: () => context.push(AppRoutes.pipelineAnalytics),
          icon: const Icon(Icons.insights_outlined),
        ),
      ],
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : board == null
          ? const SizedBox.shrink()
          : Column(
              children: [
                _TotalsBar(board: board),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.all(AppSpacing.md),
                      children: [
                        for (final column in board.columns)
                          _KanbanColumn(
                            column: column,
                            canDrag:
                                ref.watch(authControllerProvider).user?.canChangeStage ==
                                true,
                            movingId: _movingId,
                            onAccept: (card) => _move(card, column.stage),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _TotalsBar extends StatelessWidget {
  const _TotalsBar({required this.board});

  final PipelineBoard board;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
      child: Wrap(
        spacing: AppSpacing.sm,
        children: [
          Chip(label: Text('${board.totalLeads} leads')),
          Chip(label: Text('${board.open} open')),
          Chip(label: Text('${board.won} won')),
          Chip(label: Text('${board.lost} lost')),
        ],
      ),
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.column,
    required this.canDrag,
    required this.onAccept,
    this.movingId,
  });

  final PipelineColumn column;
  final bool canDrag;
  final String? movingId;
  final ValueChanged<PipelineCard> onAccept;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stage = column.stage;
    final headerColor = stage.isWon
        ? theme.colorScheme.primaryContainer
        : stage.isLost
        ? theme.colorScheme.errorContainer
        : theme.colorScheme.surfaceContainerHighest;
    return DragTarget<PipelineCard>(
      onWillAcceptWithDetails: (details) => details.data.stageId != stage.id,
      onAcceptWithDetails: (details) => onAccept(details.data),
      builder: (context, candidate, rejected) {
        final hovering = candidate.isNotEmpty;
        return Container(
          width: 280,
          margin: const EdgeInsets.only(right: AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: hovering ? theme.colorScheme.primary : theme.dividerColor,
              width: hovering ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: headerColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(stage.name.toUpperCase(), style: theme.textTheme.titleSmall),
                    Text(
                      '${column.count} · ₹${(column.valueMinor / 100).toStringAsFixed(0)}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  children: [
                    if (column.leads.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Text(
                          hovering ? 'Drop here' : 'No leads',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    for (final card in column.leads)
                      _KanbanCard(
                        card: card,
                        canDrag: canDrag,
                        moving: movingId == card.id,
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _KanbanCard extends StatelessWidget {
  const _KanbanCard({
    required this.card,
    required this.canDrag,
    required this.moving,
  });

  final PipelineCard card;
  final bool canDrag;
  final bool moving;

  @override
  Widget build(BuildContext context) {
    final child = Opacity(
      opacity: moving ? 0.5 : 1,
      child: Card(
        child: ListTile(
          dense: true,
          title: Text(card.displayName, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            [
              card.leadNumber,
              if (card.quality != null) card.quality!,
              card.valueLabel,
              if (card.ownerName != null) card.ownerName!,
            ].join(' · '),
          ),
          onTap: () => context.push(AppRoutes.leadDetailPath(card.id)),
        ),
      ),
    );
    if (!canDrag) {
      return child;
    }
    return LongPressDraggable<PipelineCard>(
      data: card,
      feedback: Material(
        elevation: 6,
        child: SizedBox(width: 240, child: child),
      ),
      childWhenDragging: Opacity(opacity: 0.3, child: child),
      child: child,
    );
  }
}
