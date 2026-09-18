export const TIMELINE_EVENT = {
  leadCreated: 'lead_created',
  leadUpdated: 'lead_updated',
  statusChanged: 'status_changed',
  followUpAdded: 'follow_up_added',
  quotationSent: 'quotation_sent',
  siteVisitAdded: 'site_visit_added',
  warrantyIssued: 'warranty_issued',
  callStarted: 'call_started',
  whatsappSent: 'whatsapp_sent',
  smsSent: 'sms_sent',
  customerSynced: 'customer_synced',
  invoiceSynced: 'invoice_synced',
  paymentReceived: 'payment_received',
} as const;

export type TimelineEventCode = (typeof TIMELINE_EVENT)[keyof typeof TIMELINE_EVENT];

export const TIMELINE_CATALOG: ReadonlyArray<{
  code: TimelineEventCode;
  title: string;
}> = [
  { code: TIMELINE_EVENT.leadCreated, title: 'Lead Created' },
  { code: TIMELINE_EVENT.leadUpdated, title: 'Lead Updated' },
  { code: TIMELINE_EVENT.statusChanged, title: 'Status Changed' },
  { code: TIMELINE_EVENT.followUpAdded, title: 'Follow-up Added' },
  { code: TIMELINE_EVENT.quotationSent, title: 'Quotation Sent' },
  { code: TIMELINE_EVENT.siteVisitAdded, title: 'Site Visit Added' },
  { code: TIMELINE_EVENT.warrantyIssued, title: 'Warranty Issued' },
  { code: TIMELINE_EVENT.callStarted, title: 'Call' },
  { code: TIMELINE_EVENT.whatsappSent, title: 'WhatsApp' },
  { code: TIMELINE_EVENT.smsSent, title: 'SMS' },
  { code: TIMELINE_EVENT.customerSynced, title: 'Customer Synced' },
  { code: TIMELINE_EVENT.invoiceSynced, title: 'Invoice Synced' },
  { code: TIMELINE_EVENT.paymentReceived, title: 'Payment Received' },
];

const TITLES = new Map(TIMELINE_CATALOG.map((item) => [item.code, item.title]));

export function isTimelineCatalogEvent(code: string): code is TimelineEventCode {
  return TITLES.has(code as TimelineEventCode);
}

export function titleForEvent(code: string, fallback?: string | null): string {
  return TITLES.get(code as TimelineEventCode) ?? fallback ?? code;
}
