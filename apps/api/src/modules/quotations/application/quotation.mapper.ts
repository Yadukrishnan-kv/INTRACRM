import { wholeQuantity } from '../../../common/whole-quantity';
import { allowedNextStatuses } from '../domain/quotation-types';
import {
  ClosingPrediction,
  dateToYmd,
  isClosingOverdue,
  isClosingSoon,
  predictQuotationClose,
  reminderBucket,
} from '../domain/quotation-follow-up';

export type QuotationItemView = {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxBps: number;
  taxRateIds: string[];
  lineTotalMinor: number;
  sortOrder: number;
};

export type QuotationView = {
  id: string;
  quotationNumber: string;
  title: string | null;
  status: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  validUntilOn: string | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  followUpAt: string | null;
  customerDecidingAt: string | null;
  negotiationAt: string | null;
  approvedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  nextFollowUpAt: string | null;
  remindAt: string | null;
  expectedCloseOn: string | null;
  lastFollowedUpAt: string | null;
  followUpNote: string | null;
  reminderBucket: string | null;
  closingSoon: boolean;
  closingOverdue: boolean;
  closingPrediction: ClosingPrediction;
  assignedToMembershipId: string | null;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  nextStatuses: string[];
  items: QuotationItemView[];
  version: number;
};

type QuotationMappedRow = {
  id: string;
  quotationNumber: string;
  title: string | null;
  status: string;
  currency: string;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  validUntilOn: Date | null;
  notes: string | null;
  terms: string | null;
  sentAt: Date | null;
  followUpAt: Date | null;
  customerDecidingAt: Date | null;
  negotiationAt: Date | null;
  approvedAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  nextFollowUpAt?: Date | null;
  remindAt?: Date | null;
  expectedCloseOn?: Date | null;
  lastFollowedUpAt?: Date | null;
  followUpNote?: string | null;
  assignedToMembershipId: string | null;
  version: number;
  createdAt?: Date;
  leadId?: string;
  assignee?: { user: { fullName: string } } | null;
  lead?: {
    id: string;
    leadNumber: string;
    title: string;
    customerName: string | null;
  } | null;
  items?: Array<{
    id: string;
    productId: string | null;
    description: string;
    quantity: number;
    unitPriceMinor: bigint;
    discountMinor: bigint;
    taxBps: number;
    taxRateIds?: unknown;
    lineTotalMinor: bigint;
    sortOrder: number;
    deletedAt: Date | null;
    product?: { name: string } | null;
  }>;
};

export type QuotationViewContext = {
  now: Date;
  timeZone: string;
};

function money(value: bigint | number): number {
  return Number(value);
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function toQuotationView(
  row: QuotationMappedRow,
  ctx: QuotationViewContext = { now: new Date(), timeZone: 'Asia/Kolkata' },
): QuotationView {
  const items = (row.items ?? []).filter((item) => item.deletedAt == null);
  const expectedCloseOn = dateToYmd(row.expectedCloseOn ?? null);
  const followInput = {
    status: row.status,
    nextFollowUpAt: row.nextFollowUpAt ?? null,
    remindAt: row.remindAt ?? null,
    expectedCloseOn: row.expectedCloseOn ?? null,
    validUntilOn: row.validUntilOn,
    lastFollowedUpAt: row.lastFollowedUpAt ?? null,
    sentAt: row.sentAt,
    createdAt: row.createdAt ?? ctx.now,
  };
  return {
    id: row.id,
    quotationNumber: row.quotationNumber,
    title: row.title,
    status: row.status,
    currency: row.currency,
    subtotalMinor: money(row.subtotalMinor),
    discountMinor: money(row.discountMinor),
    taxMinor: money(row.taxMinor),
    totalMinor: money(row.totalMinor),
    validUntilOn: dateToYmd(row.validUntilOn),
    notes: row.notes,
    terms: row.terms,
    sentAt: row.sentAt?.toISOString() ?? null,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    customerDecidingAt: row.customerDecidingAt?.toISOString() ?? null,
    negotiationAt: row.negotiationAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    wonAt: row.wonAt?.toISOString() ?? null,
    lostAt: row.lostAt?.toISOString() ?? null,
    lostReason: row.lostReason,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    remindAt: row.remindAt?.toISOString() ?? null,
    expectedCloseOn,
    lastFollowedUpAt: row.lastFollowedUpAt?.toISOString() ?? null,
    followUpNote: row.followUpNote ?? null,
    reminderBucket: reminderBucket({
      status: row.status,
      nextFollowUpAt: row.nextFollowUpAt ?? null,
      now: ctx.now,
      timeZone: ctx.timeZone,
    }),
    closingSoon: isClosingSoon({
      status: row.status,
      expectedCloseOn,
      now: ctx.now,
      timeZone: ctx.timeZone,
    }),
    closingOverdue: isClosingOverdue({
      status: row.status,
      expectedCloseOn,
      now: ctx.now,
      timeZone: ctx.timeZone,
    }),
    closingPrediction: predictQuotationClose(followInput, ctx.now, ctx.timeZone),
    assignedToMembershipId: row.assignedToMembershipId,
    assigneeName: row.assignee?.user.fullName ?? null,
    leadId: row.lead?.id ?? row.leadId ?? '',
    leadNumber: row.lead?.leadNumber ?? null,
    leadTitle: row.lead?.title ?? null,
    customerName: row.lead?.customerName ?? null,
    nextStatuses: allowedNextStatuses(row.status),
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name ?? null,
      description: item.description,
      quantity: wholeQuantity(item.quantity),
      unitPriceMinor: money(item.unitPriceMinor),
      discountMinor: money(item.discountMinor),
      taxBps: item.taxBps,
      taxRateIds: asIdList(item.taxRateIds),
      lineTotalMinor: money(item.lineTotalMinor),
      sortOrder: item.sortOrder,
    })),
    version: row.version,
  };
}
