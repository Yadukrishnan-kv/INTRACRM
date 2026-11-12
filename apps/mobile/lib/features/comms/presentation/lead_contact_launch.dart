import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../l10n/app_strings.dart';
import '../../auth/application/auth_controller.dart';
import '../../leads/application/lead_list_controller.dart';
import '../../leads/domain/lead.dart';
import '../application/comms_providers.dart';
import '../domain/comms_models.dart';

/// Opens the phone dialer with the lead's number prefilled.
///
/// Device-first: the dialer opens straight from the lead's stored number, so
/// it works offline, for leads not yet synced, and for users who can't log
/// activities. The call is then logged on the lead's activity timeline
/// (queued offline) when the user is allowed to log activities.
Future<void> openLeadDialer(
  BuildContext context,
  WidgetRef ref,
  Lead lead, {
  Future<void> Function()? onLogged,
}) async {
  final uri = leadDialerUri(lead.primaryPhone);
  if (uri == null) {
    _snack(context, AppStrings.noValidPhone);
    return;
  }
  final opened = await ref.read(commsLauncherProvider).open(uri);
  if (!context.mounted) {
    return;
  }
  if (!opened) {
    _snack(context, AppStrings.couldNotOpenDialer);
    return;
  }
  await _log(
    ref,
    lead,
    type: 'call',
    subject: 'Call',
    body: 'Called ${leadPhoneE164(lead.primaryPhone) ?? lead.primaryPhone}',
    onLogged: onLogged,
  );
}

/// Opens a WhatsApp chat with the lead's registered number (`wa.me` link:
/// the WhatsApp app when installed, otherwise WhatsApp Web).
Future<void> openLeadWhatsappChat(
  BuildContext context,
  WidgetRef ref,
  Lead lead, {
  Future<void> Function()? onLogged,
}) async {
  final phone = lead.primaryPhone;
  if (phone == null || phone.trim().isEmpty) {
    _snack(context, AppStrings.noValidPhone);
    return;
  }
  final uri = leadWhatsappChatUri(phone);
  if (uri == null) {
    _snack(context, AppStrings.whatsappNeedsCountryCode);
    return;
  }
  final opened = await ref.read(commsLauncherProvider).open(uri);
  if (!context.mounted) {
    return;
  }
  if (!opened) {
    _snack(context, AppStrings.couldNotOpenWhatsapp);
    return;
  }
  await _log(
    ref,
    lead,
    type: 'whatsapp',
    subject: 'WhatsApp',
    body: 'Opened WhatsApp chat with ${leadPhoneE164(phone)}',
    onLogged: onLogged,
  );
}

/// Best-effort timeline entry; never blocks or fails the launch.
Future<void> _log(
  WidgetRef ref,
  Lead lead, {
  required String type,
  required String subject,
  required String body,
  Future<void> Function()? onLogged,
}) async {
  if (ref.read(authControllerProvider).user?.canCreateActivity != true) {
    return;
  }
  try {
    await ref.read(leadRepositoryProvider).addActivity(
      leadId: lead.id,
      type: type,
      subject: subject,
      body: body,
    );
    await onLogged?.call();
  } catch (_) {
    // Logging is a convenience; the dialer/chat has already opened.
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
