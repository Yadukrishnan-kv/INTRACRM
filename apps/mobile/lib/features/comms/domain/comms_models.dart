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

