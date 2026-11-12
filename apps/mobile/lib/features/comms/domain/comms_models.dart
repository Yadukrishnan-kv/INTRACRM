import '../../leads/domain/lead.dart';

class CommsTemplate {
  const CommsTemplate({
    required this.id,
    required this.channel,
    required this.code,
    required this.name,
    required this.body,
  });

  final String id;
  final String channel;
  final String code;
  final String name;
  final String body;

  factory CommsTemplate.fromJson(Map<String, dynamic> json) {
    return CommsTemplate(
      id: json['id'] as String,
      channel: json['channel'] as String? ?? '',
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      body: json['body'] as String? ?? '',
    );
  }
}

class CommsResult {
  const CommsResult({
    required this.id,
    required this.channel,
    required this.to,
    required this.mode,
    this.body,
    this.launchUri,
    this.warning,
  });

  final String id;
  final String channel;
  final String to;
  final String mode;
  final String? body;
  final String? launchUri;
  final String? warning;

  bool get sentByGateway => mode == 'sent';

  factory CommsResult.fromJson(Map<String, dynamic> json) {
    return CommsResult(
      id: json['id'] as String,
      channel: json['channel'] as String? ?? '',
      to: json['to'] as String? ?? '',
      mode: json['mode'] as String? ?? 'device',
      body: json['body'] as String?,
      launchUri: json['launchUri'] as String?,
      warning: json['warning'] as String?,
    );
  }
}

/// Builds the undocumented but widely-relied-on `whatsapp://call?phone=`
/// deep link that opens WhatsApp directly on the voice-call screen for a
/// number, instead of just the chat. WhatsApp does not publish an official
/// scheme for this, so it is best-effort: on devices/app versions where it
/// isn't registered, [CommsLauncher.open] reports failure like any other
/// unhandled intent and the caller falls back to the chat (`wa.me`) link.
String whatsappCallUri(String e164) => 'whatsapp://call?phone=${e164.replaceAll('+', '')}';

String fillMessageTemplate(String body, Lead lead, {String staffName = 'INTRA LEADS'}) {
  final customer = (lead.customerName != null && lead.customerName!.trim().isNotEmpty)
      ? lead.customerName!.trim()
      : lead.title;
  return body
      .replaceAll(RegExp(r'\{\{\s*customer_name\s*\}\}'), customer)
      .replaceAll(RegExp(r'\{\{\s*lead_title\s*\}\}'), lead.title)
      .replaceAll(RegExp(r'\{\{\s*lead_number\s*\}\}'), lead.leadNumber)
      .replaceAll(RegExp(r'\{\{\s*staff_name\s*\}\}'), staffName)
      .replaceAll(RegExp(r'\{\{\s*city\s*\}\}'), lead.city ?? '');
}


/// Normalises a lead's stored phone to E.164 for device deep links.
///
/// Mirrors the API's `parseLeadPhone` default of India (+91) for numbers saved
/// without a country code (e.g. leads captured offline as `98765 43210` or
/// `098765-43210`). Returns null when the number can't be made into a
/// plausible international number; callers then fall back to the raw digits
/// for the dialer, and refuse WhatsApp (which needs the country code).
String? leadPhoneE164(String? raw) {
  if (raw == null) {
    return null;
  }
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return null;
  }
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');
  String? e164;
  if (trimmed.startsWith('+')) {
    e164 = '+$digits';
  } else if (digits.startsWith('00')) {
    e164 = '+${digits.substring(2)}';
  } else if (digits.length == 10) {
    e164 = '+91$digits';
  } else if (digits.length == 11 && digits.startsWith('0')) {
    e164 = '+91${digits.substring(1)}';
  } else if (digits.length == 12 && digits.startsWith('91')) {
    e164 = '+$digits';
  }
  if (e164 == null) {
    return null;
  }
  final count = e164.length - 1;
  return count >= 8 && count <= 15 ? e164 : null;
}

/// `tel:` URI that opens the phone dialer with the number prefilled (it does
/// not place the call by itself).
String? leadDialerUri(String? raw) {
  final e164 = leadPhoneE164(raw);
  if (e164 != null) {
    return 'tel:$e164';
  }
  final dialable = raw?.replaceAll(RegExp(r'[^\d+*#]'), '') ?? '';
  return dialable.isEmpty ? null : 'tel:$dialable';
}

/// `https://wa.me/<digits>` deep link that opens a WhatsApp chat with the
/// number (WhatsApp app if installed, otherwise WhatsApp Web).
String? leadWhatsappChatUri(String? raw) {
  final e164 = leadPhoneE164(raw);
  return e164 == null ? null : 'https://wa.me/${e164.substring(1)}';
}
