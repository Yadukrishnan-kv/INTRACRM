import { wholeQuantity } from '../../../common/whole-quantity';
import {
  WARRANTY_STATUS_LABELS,
  allowedNextWarrantyStatuses,
  effectiveWarrantyStatus,
} from '../domain/warranty-types';

export type WarrantyItemView = {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string;
  serialNumber: string | null;
  quantity: number;
};

export type WarrantyView = {
  id: string;
  cardNumber: string;
  status: string;
  storedStatus: string;
  statusLabel: string;
  serialNumber: string | null;
  purchasedOn: string | null;
  warrantyStartOn: string;
  warrantyEndOn: string;
  coverageNotes: string | null;
  verifyUrl: string;
  leadId: string | null;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  issuedByName: string | null;
  nextStatuses: string[];
  items: WarrantyItemView[];
  version: number;
};

type WarrantyMappedRow = {
  id: string;
  cardNumber: string;
  status: string;
  serialNumber: string | null;
  purchasedOn: Date | null;
  warrantyStartOn: Date;
  warrantyEndOn: Date;
  coverageNotes: string | null;
  leadId: string | null;
  quotationId: string | null;
  version: number;
  lead: { leadNumber: string; title: string; customerName: string | null } | null;
  quotation: { quotationNumber: string } | null;
  issuer: { user: { fullName: string } } | null;
  items: Array<{
    id: string;
    productId: string | null;
    description: string;
    serialNumber: string | null;
    quantity: number;
    product: { name: string } | null;
  }>;
};

function ymd(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toWarrantyView(
  row: WarrantyMappedRow,
  input: { todayYmd: string; verifyUrl: string },
): WarrantyView {
  const start = ymd(row.warrantyStartOn) ?? input.todayYmd;
  const end = ymd(row.warrantyEndOn) ?? input.todayYmd;
  const status = effectiveWarrantyStatus({
    status: row.status,
    warrantyEndOn: end,
    todayYmd: input.todayYmd,
  });
  return {
    id: row.id,
    cardNumber: row.cardNumber,
    status,
    storedStatus: row.status,
    statusLabel: WARRANTY_STATUS_LABELS[status] ?? status,
    serialNumber: row.serialNumber,
    purchasedOn: ymd(row.purchasedOn),
    warrantyStartOn: start,
    warrantyEndOn: end,
    coverageNotes: row.coverageNotes,
    verifyUrl: input.verifyUrl,
    leadId: row.leadId,
    leadNumber: row.lead?.leadNumber ?? null,
    leadTitle: row.lead?.title ?? null,
    customerName: row.lead?.customerName ?? null,
    quotationId: row.quotationId,
    quotationNumber: row.quotation?.quotationNumber ?? null,
    issuedByName: row.issuer?.user.fullName ?? null,
    nextStatuses: allowedNextWarrantyStatuses(status),
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name ?? null,
      description: item.description,
      serialNumber: item.serialNumber,
      quantity: wholeQuantity(item.quantity),
    })),
    version: row.version,
  };
}

export function toPublicWarrantyView(
  row: WarrantyMappedRow & { tenant: { name: string } },
  input: { todayYmd: string },
) {
  const view = toWarrantyView(row, { todayYmd: input.todayYmd, verifyUrl: '' });
  return {
    valid: view.status === 'active',
    cardNumber: view.cardNumber,
    status: view.status,
    statusLabel: view.statusLabel,
    serialNumber: view.serialNumber,
    customerName: view.customerName,
    tenantName: row.tenant.name,
    purchasedOn: view.purchasedOn,
    warrantyStartOn: view.warrantyStartOn,
    warrantyEndOn: view.warrantyEndOn,
    coverageNotes: view.coverageNotes,
    items: view.items.map((item) => ({
      description: item.description,
      serialNumber: item.serialNumber,
      quantity: item.quantity,
    })),
  };
}
