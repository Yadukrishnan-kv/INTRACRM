import 'package:flutter/material.dart';

import '../../../l10n/app_strings.dart';
import '../domain/pipeline_models.dart';

/// What the user entered when marking a lead/deal as lost.
class MarkLostInput {
  const MarkLostInput({required this.lostReasonId, this.notes});

  final String lostReasonId;
  final String? notes;
}

/// Asks for a loss reason and a short summary of why the lead was lost.
///
/// Lost is reachable from any stage, so both the lead detail page and the
/// pipeline board use this dialog. Returns null when cancelled, or when no
/// loss reasons are configured (a snackbar explains why).
Future<MarkLostInput?> showMarkLostDialog(
  BuildContext context,
  List<LossReason> reasons,
) async {
  if (reasons.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(AppStrings.addLossReasonFirst)),
    );
    return null;
  }
  return showDialog<MarkLostInput>(
    context: context,
    builder: (context) => _MarkLostDialog(reasons: reasons),
  );
}

class _MarkLostDialog extends StatefulWidget {
  const _MarkLostDialog({required this.reasons});

  final List<LossReason> reasons;

  @override
  State<_MarkLostDialog> createState() => _MarkLostDialogState();
}

class _MarkLostDialogState extends State<_MarkLostDialog> {
  late String _reasonId = widget.reasons.first.id;
  final _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text(AppStrings.markAsLost),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(AppStrings.markAsLostHint, style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _reasonId,
              decoration: const InputDecoration(
                labelText: AppStrings.lossReason,
              ),
              items: [
                for (final reason in widget.reasons)
                  DropdownMenuItem(value: reason.id, child: Text(reason.name)),
              ],
              onChanged: (value) =>
                  setState(() => _reasonId = value ?? _reasonId),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 3,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: AppStrings.lostNotes,
                hintText: AppStrings.lostNotesHint,
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: theme.colorScheme.error,
            foregroundColor: theme.colorScheme.onError,
          ),
          onPressed: () {
            final notes = _notes.text.trim();
            Navigator.pop(
              context,
              MarkLostInput(
                lostReasonId: _reasonId,
                notes: notes.isEmpty ? null : notes,
              ),
            );
          },
          child: const Text(AppStrings.markAsLost),
        ),
      ],
    );
  }
}
