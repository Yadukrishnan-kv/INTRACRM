export const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'follow_up',
  'customer_deciding',
  'negotiation',
  'approved',
  'won',
  'lost',
] as const;

export type QuotationStatusCode = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatusCode, string> = {
  draft: 'Draft',
  sent: 'Sent',
  follow_up: 'Follow-up',
  customer_deciding: 'Customer Deciding',
  negotiation: 'Negotiation',
  approved: 'Approved',
  won: 'Won',
  lost: 'Lost',
};

export const QUOTATION_FUNNEL: QuotationStatusCode[] = [
  'draft',
  'sent',
  'follow_up',
  'customer_deciding',
  'negotiation',
  'approved',
  'won',
];

export function quotationCatalog() {
  return {
    statuses: QUOTATION_STATUSES.map((code) => ({
      code,
      label: QUOTATION_STATUS_LABELS[code],
    })),
    pendingStatuses: [...PENDING_QUOTATION_STATUSES],
    followUpBuckets: [
      { code: 'pending', label: 'Pending' },
      { code: 'overdue', label: 'Overdue reminder' },
      { code: 'today', label: 'Due today' },
      { code: 'upcoming', label: 'Upcoming' },
      { code: 'closing_soon', label: 'Closing soon' },
      { code: 'closing_overdue', label: 'Closing overdue' },
      { code: 'no_follow_up', label: 'No reminder' },
    ],
  };
}

export const PENDING_QUOTATION_STATUSES = [
  'sent',
  'follow_up',
  'customer_deciding',
  'negotiation',
  'approved',
] as const;

export type PendingQuotationStatus = (typeof PENDING_QUOTATION_STATUSES)[number];

export function isPendingQuotation(status: string): boolean {
  return (PENDING_QUOTATION_STATUSES as readonly string[]).includes(status);
}

export function isTerminalQuotation(status: string): boolean {
  return status === 'won' || status === 'lost';
}

export function isDraftQuotation(status: string): boolean {
  return status === 'draft';
}

export function canSendQuotationStatus(status: string): boolean {
  return status === 'draft';
}

export function allowedNextStatuses(current: string): QuotationStatusCode[] {
  if (isTerminalQuotation(current)) {
    return [];
  }
  if (current === 'draft') {
    return ['sent', 'lost'];
  }
  const index = QUOTATION_FUNNEL.indexOf(current as QuotationStatusCode);
  if (index < 0) {
    return ['lost'];
  }
  const later = QUOTATION_FUNNEL.slice(index + 1).filter((code) => {
    if (code === 'won') {
      return current === 'approved';
    }
    return true;
  });
  return [...later, 'lost'];
}

export function canTransitionQuotation(from: string, to: string): boolean {
  return allowedNextStatuses(from).includes(to as QuotationStatusCode);
}

export function timestampFieldForStatus(status: string): string | null {
  switch (status) {
    case 'sent':
      return 'sentAt';
    case 'follow_up':
      return 'followUpAt';
    case 'customer_deciding':
      return 'customerDecidingAt';
    case 'negotiation':
      return 'negotiationAt';
    case 'approved':
      return 'approvedAt';
    case 'won':
      return 'wonAt';
    case 'lost':
      return 'lostAt';
    default:
      return null;
  }
}
