import { wholeQuantity } from '../../../common/whole-quantity';

export type QuotationLineInput = {
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxBps: number;
};

export type QuotationLineAmounts = {
  extendedMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
};

export type QuotationTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: QuotationLineAmounts[];
};

export function lineAmounts(item: QuotationLineInput): QuotationLineAmounts {
  const quantity = wholeQuantity(item.quantity);
  const unit = Math.max(0, Math.trunc(item.unitPriceMinor));
  const discount = Math.max(0, Math.trunc(item.discountMinor));
  const taxBps = Math.min(10000, Math.max(0, Math.trunc(item.taxBps)));
  const extendedMinor = Math.max(0, Math.round(quantity * unit));
  const discountMinor = Math.min(extendedMinor, discount);
  const taxableMinor = extendedMinor - discountMinor;
  const taxMinor = Math.round((taxableMinor * taxBps) / 10000);
  return {
    extendedMinor,
    discountMinor,
    taxableMinor,
    taxMinor,
    lineTotalMinor: taxableMinor + taxMinor,
  };
}

export function computeQuotationTotals(items: QuotationLineInput[]): QuotationTotals {
  const lines = items.map(lineAmounts);
  const subtotalMinor = lines.reduce((sum, line) => sum + line.extendedMinor, 0);
  const discountMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: subtotalMinor - discountMinor + taxMinor,
    lines,
  };
}
