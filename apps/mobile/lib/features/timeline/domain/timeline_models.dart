class TimelineEvent {
  const TimelineEvent({
    required this.id,
    required this.eventCode,
    required this.title,
    required this.occurredAt,
    required this.leadId,
    required this.leadNumber,
    required this.leadTitle,
    this.body,
    this.actorName,
    this.customerName,
  });

  final String id;
  final String eventCode;
  final String title;
  final String? body;
  final DateTime occurredAt;
  final String? actorName;
  final String leadId;
  final String leadNumber;
  final String leadTitle;
  final String? customerName;

  String get leadLabel =>
      (customerName != null && customerName!.trim().isNotEmpty)
      ? customerName!
      : leadTitle;

  factory TimelineEvent.fromJson(Map<String, dynamic> json) {
    final lead = json['lead'] as Map<String, dynamic>? ?? const {};
    return TimelineEvent(
      id: json['id'] as String,
      eventCode: json['eventCode'] as String? ?? 'system',
      title: json['title'] as String? ?? json['subject'] as String? ?? 'Activity',
      body: json['body'] as String?,
      occurredAt:
          DateTime.tryParse(json['occurredAt'] as String? ?? '') ?? DateTime.now().toUtc(),
      actorName: json['actorName'] as String?,
      leadId: lead['id'] as String? ?? '',
      leadNumber: lead['leadNumber'] as String? ?? '',
      leadTitle: lead['title'] as String? ?? '',
      customerName: lead['customerName'] as String?,
    );
  }
}

class TimelineCatalogItem {
  const TimelineCatalogItem({required this.code, required this.title});

  final String code;
  final String title;

  factory TimelineCatalogItem.fromJson(Map<String, dynamic> json) {
    return TimelineCatalogItem(
      code: json['code'] as String,
      title: json['title'] as String? ?? json['code'] as String,
    );
  }
}

const timelineCatalog = [
  TimelineCatalogItem(code: 'lead_created', title: 'Lead Created'),
  TimelineCatalogItem(code: 'lead_updated', title: 'Lead Updated'),
  TimelineCatalogItem(code: 'status_changed', title: 'Status Changed'),
  TimelineCatalogItem(code: 'follow_up_added', title: 'Follow-up Added'),
  TimelineCatalogItem(code: 'quotation_sent', title: 'Quotation Sent'),
  TimelineCatalogItem(code: 'site_visit_added', title: 'Site Visit Added'),
  TimelineCatalogItem(code: 'warranty_issued', title: 'Warranty Issued'),
  TimelineCatalogItem(code: 'call_started', title: 'Call'),
  TimelineCatalogItem(code: 'whatsapp_sent', title: 'WhatsApp'),
  TimelineCatalogItem(code: 'sms_sent', title: 'SMS'),
  TimelineCatalogItem(code: 'customer_synced', title: 'Customer Synced'),
  TimelineCatalogItem(code: 'invoice_synced', title: 'Invoice Synced'),
  TimelineCatalogItem(code: 'payment_received', title: 'Payment Received'),
];
