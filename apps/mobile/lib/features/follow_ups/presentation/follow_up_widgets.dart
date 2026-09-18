import 'package:flutter/material.dart';

import '../../../l10n/app_strings.dart';
import '../../leads/domain/lead.dart';

class FollowUpTypeChips extends StatelessWidget {
  const FollowUpTypeChips({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: [
        for (final code in FollowUpTypes.all)
          ChoiceChip(
            label: Text(FollowUpTypes.title(code)),
            selected: value == code,
            onSelected: (_) => onChanged(code),
          ),
      ],
    );
  }
}

class FollowUpFilterChips extends StatelessWidget {
  const FollowUpFilterChips({
    super.key,
    required this.status,
    required this.type,
    required this.overdue,
    required this.onChanged,
  });

  final String? status;
  final String? type;
  final bool overdue;
  final void Function({String? status, String? type, bool overdue}) onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          children: [
            FilterChip(
              label: const Text('All'),
              selected: status == null && !overdue,
              onSelected: (_) => onChanged(status: null, type: type, overdue: false),
            ),
            FilterChip(
              label: const Text(AppStrings.overdue),
              selected: overdue,
              onSelected: (_) => onChanged(status: null, type: type, overdue: true),
            ),
            FilterChip(
              label: const Text(AppStrings.pending),
              selected: status == 'pending' && !overdue,
              onSelected: (_) => onChanged(status: 'pending', type: type, overdue: false),
            ),
            FilterChip(
              label: const Text(AppStrings.completed),
              selected: status == 'completed' && !overdue,
              onSelected: (_) => onChanged(status: 'completed', type: type, overdue: false),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            FilterChip(
              label: const Text('Any type'),
              selected: type == null,
              onSelected: (_) => onChanged(status: status, type: null, overdue: overdue),
            ),
            for (final code in FollowUpTypes.all)
              FilterChip(
                label: Text(FollowUpTypes.title(code)),
                selected: type == code,
                onSelected: (_) => onChanged(status: status, type: code, overdue: overdue),
              ),
          ],
        ),
      ],
    );
  }
}

IconData followUpTypeIcon(String type) {
  return switch (type) {
    FollowUpTypes.call => Icons.call_outlined,
    FollowUpTypes.whatsapp => Icons.chat_outlined,
    FollowUpTypes.visit => Icons.location_on_outlined,
    FollowUpTypes.meeting => Icons.groups_outlined,
    _ => Icons.event_available_outlined,
  };
}
