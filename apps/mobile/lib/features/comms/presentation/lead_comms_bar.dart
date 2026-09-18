import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/domain/lead.dart';
import '../application/comms_providers.dart';
import '../domain/comms_models.dart';

class LeadCommsBar extends ConsumerWidget {
  const LeadCommsBar({
    super.key,
    required this.lead,
    required this.onLogged,
    this.dock = false,
    this.onMore,
  });

  final Lead lead;
  final Future<void> Function() onLogged;
  final bool dock;
  final VoidCallback? onMore;

  bool get _hasPhone =>
      lead.primaryPhone != null && lead.primaryPhone!.trim().isNotEmpty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (dock) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _hasPhone ? () => _call(context, ref) : null,
                  icon: const Icon(Icons.call),
                  label: const Text(AppStrings.call),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _hasPhone ? () => _compose(context, ref, 'whatsapp') : null,
                  icon: const Icon(Icons.chat),
                  label: const Text(AppStrings.whatsapp),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 52,
                child: OutlinedButton(
                  onPressed: onMore,
                  child: const Icon(Icons.more_horiz),
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        children: [
          _action(
            context,
            icon: Icons.call,
            label: AppStrings.clickToCall,
            onPressed: _hasPhone ? () => _call(context, ref) : null,
          ),
          _action(
            context,
            icon: Icons.chat,
            label: AppStrings.whatsapp,
            onPressed: _hasPhone ? () => _compose(context, ref, 'whatsapp') : null,
          ),
          _action(
            context,
            icon: Icons.sms_outlined,
            label: AppStrings.sms,
            onPressed: _hasPhone ? () => _compose(context, ref, 'sms') : null,
          ),
        ],
      ),
    );
  }

  Widget _action(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
  }) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(right: AppSpacing.xs),
        child: OutlinedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 18),
          label: Text(label),
        ),
      ),
    );
  }

  Future<void> _call(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.clickToCall),
          content: Text('Call ${lead.primaryPhone}?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text(AppStrings.call)),
          ],
        );
      },
    );
    if (confirmed != true) {
      return;
    }
    await _send(context, ref, unwrapComms<CommsResult>(await ref.read(commsApiProvider).call(lead.id)));
  }

  Future<void> _compose(BuildContext context, WidgetRef ref, String channel) async {
    final templates = unwrapComms<List<CommsTemplate>>(
      await ref.read(commsApiProvider).templates(channel: channel),
    );
    if (!context.mounted) {
      return;
    }
    final staffName = ref.read(authControllerProvider).user?.fullName ?? 'INTRA LEADS';
    var options = const <CommsTemplate>[];
    switch (templates) {
      case Success(:final value):
        options = value;
      case Err(:final failure):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message)));
    }
    final body = TextEditingController(
      text: options.isEmpty ? '' : fillMessageTemplate(options.first.body, lead, staffName: staffName),
    );
    String? templateCode = options.isEmpty ? null : options.first.code;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.md,
            AppSpacing.md,
            MediaQuery.of(context).viewInsets.bottom + AppSpacing.md,
          ),
          child: StatefulBuilder(
            builder: (context, setSheetState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    channel == 'sms' ? AppStrings.sendSms : AppStrings.sendWhatsapp,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  if (options.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: templateCode,
                      decoration: const InputDecoration(labelText: AppStrings.messageTemplate),
                      items: [
                        for (final template in options)
                          DropdownMenuItem(value: template.code, child: Text(template.name)),
                      ],
                      onChanged: (value) {
                        templateCode = value;
                        final match = options.where((item) => item.code == value);
                        if (match.isNotEmpty) {
                          body.text = fillMessageTemplate(match.first.body, lead, staffName: staffName);
                        }
                        setSheetState(() {});
                      },
                    ),
                  const SizedBox(height: AppSpacing.sm),
                  AppTextField(
                    controller: body,
                    label: AppStrings.message,
                    maxLines: 4,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text(AppStrings.send),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    final text = body.text.trim();
    body.dispose();
    if (saved != true) {
      return;
    }
    if (channel == 'sms' && text.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter an SMS message.')),
        );
      }
      return;
    }
    final result = channel == 'sms'
        ? unwrapComms<CommsResult>(
            await ref.read(commsApiProvider).sms(lead.id, templateCode: templateCode, body: text),
          )
        : unwrapComms<CommsResult>(
            await ref.read(commsApiProvider).whatsapp(
              lead.id,
              templateCode: templateCode,
              body: text,
            ),
          );
    if (!context.mounted) {
      return;
    }
    await _send(context, ref, result);
  }

  Future<void> _send(
    BuildContext context,
    WidgetRef ref,
    Result<CommsResult> result,
  ) async {
    switch (result) {
      case Err(:final failure):
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message)));
        }
      case Success(:final value):
        if (value.warning != null && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value.warning!)));
        }
        if (value.launchUri != null && !value.sentByGateway) {
          final opened = await ref.read(commsLauncherProvider).open(value.launchUri!);
          if (!opened && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text(AppStrings.couldNotOpenApp)),
            );
          }
        } else if (value.warning == null && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                value.channel == 'call' ? AppStrings.callConnecting : AppStrings.messageSent,
              ),
            ),
          );
        }
        await onLogged();
    }
  }
}
