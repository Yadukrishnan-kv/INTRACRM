import { createHmac, timingSafeEqual } from 'crypto';

export const BILLING_RESOURCE = {
  customer: 'customer',
  invoice: 'invoice',
  payment: 'payment',
} as const;

export type BillingResource = (typeof BILLING_RESOURCE)[keyof typeof BILLING_RESOURCE];

export const BILLING_DIRECTION = {
  outbound: 'outbound',
  inbound: 'inbound',
} as const;

export const SYNC_STATUS = {
  pending: 'pending',
  synced: 'synced',
  failed: 'failed',
  stale: 'stale',
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export const INVOICE_STATUS = {
  draft: 'draft',
  issued: 'issued',
  cancelled: 'cancelled',
  void: 'void',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const PAYMENT_STATUS = {
  unpaid: 'unpaid',
  partial: 'partial',
  paid: 'paid',
  overdue: 'overdue',
  void: 'void',
  refunded: 'refunded',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const BILLING_WEBHOOK_EVENT = {
  customerUpserted: 'customer.upserted',
  invoiceUpserted: 'invoice.upserted',
  paymentRecorded: 'payment.recorded',
} as const;

export const BILLING_WEBHOOK_EVENTS = Object.values(BILLING_WEBHOOK_EVENT);

export type BillingWebhookEvent = (typeof BILLING_WEBHOOK_EVENTS)[number];

export type CustomerDraft = {
  leadId: string;
  leadNumber: string;
  displayName: string;
  phoneE164: string | null;
  email: string | null;
  city: string | null;
};

export type InvoiceLineDraft = {
  description: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type InvoiceDraft = {
  quotationId: string;
  quotationNumber: string;
  customerExternalId: string;
  currency: string;
  totalMinor: number;
  issuedOn: string;
  dueOn: string | null;
  lines: InvoiceLineDraft[];
};

export type PaymentDraft = {
  invoiceExternalId: string;
  paymentExternalId: string;
  amountMinor: number;
  currency: string;
  paidOn: string;
  method: string | null;
  status: string | null;
};

export function customerDisplayName(input: {
  customerName?: string | null;
  title: string;
}): string {
  const name = input.customerName?.trim();
  return name && name.length > 0 ? name : input.title;
}

export function localCustomerExternalId(leadNumber: string): string {
  return `CUS-${leadNumber}`;
}

export function localInvoiceExternalId(quotationNumber: string): string {
  return `INV-${quotationNumber}`;
}

export function localInvoiceNumber(quotationNumber: string): string {
  return quotationNumber.replace(/^QT-/i, 'INV-');
}

export function derivePaymentStatus(input: {
  invoiceStatus: string;
  totalMinor: number;
  balanceMinor: number;
  dueOn?: string | Date | null;
  asOf?: Date;
}): PaymentStatus {
  if (input.invoiceStatus === INVOICE_STATUS.cancelled || input.invoiceStatus === INVOICE_STATUS.void) {
    return PAYMENT_STATUS.void;
  }
  const total = input.totalMinor;
  const balance = input.balanceMinor;
  if (total > 0 && balance <= 0) {
    return PAYMENT_STATUS.paid;
  }
  if (balance > 0 && balance < total) {
    const overdue = isOverdue(input.dueOn, input.asOf);
    return overdue ? PAYMENT_STATUS.overdue : PAYMENT_STATUS.partial;
  }
  if (isOverdue(input.dueOn, input.asOf) && balance > 0) {
    return PAYMENT_STATUS.overdue;
  }
  return PAYMENT_STATUS.unpaid;
}

export function applyPaymentBalance(totalMinor: number, paidMinor: number): number {
  const remaining = totalMinor - paidMinor;
  return remaining < 0 ? 0 : remaining;
}

export function isOverdue(dueOn?: string | Date | null, asOf: Date = new Date()): boolean {
  if (!dueOn) {
    return false;
  }
  const due = typeof dueOn === 'string' ? new Date(`${dueOn}T00:00:00.000Z`) : dueOn;
  if (Number.isNaN(due.getTime())) {
    return false;
  }
  return due.getTime() < asOf.getTime();
}

export function verifyHmacSha256(
  payload: Buffer | string,
  secret: string,
  signatureHeader?: string | null,
): boolean {
  if (!secret || !signatureHeader) {
    return false;
  }
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  if (!/^[0-9a-f]+$/i.test(provided)) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.toLowerCase(), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
