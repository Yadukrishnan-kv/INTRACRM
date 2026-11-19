import { wholeQuantity } from '../../../common/whole-quantity';

export const DEFAULT_GST_BPS = 1800;

export type MarginType = 'percent' | 'fixed';

export type QuotationLineInput = {
  quantity: number;
  /** Selling unit price before tax, in paise. */
  unitPriceMinor: number;
  taxBps: number;
};

export type QuotationChargeInput = {
  description: string;
  /** Charge before tax, in paise. */
  amountMinor: number;
  taxBps: number;
};

export type QuotationLineAmounts = {
  extendedMinor: number;
  /** This line's share of the total discount. */
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
  charges: QuotationLineAmounts[];
};

export type UnitPriceInput = {
  unitPriceMinor?: number | null;
  vendorPriceMinor?: number | null;
  marginType?: MarginType | null;
  /** Basis points for percent margins (2000 = 20%), paise per unit for fixed. */
  marginValue?: number | null;
  /** Vendor-priced lines round up to a multiple of this (paise); 0/1 disables. */
  roundStepMinor?: number | null;
};

export type ResolvedUnitPrice = {
  unitPriceMinor: number;
  vendorPriceMinor: number | null;
  marginType: MarginType | null;
  marginValue: number;
};

const clampBps = (bps: number) => Math.min(10000, Math.max(0, Math.trunc(bps)));
const paise = (value: number | null | undefined) => Math.max(0, Math.trunc(value ?? 0));

export function roundUpTo(amountMinor: number, stepMinor: number | null | undefined): number {
  const step = paise(stepMinor);
  return step > 1 ? Math.ceil(amountMinor / step) * step : amountMinor;
}

/**
 * Selling unit price for a line. Vendor price + margin is rounded up to the
 * rounding step (e.g. 9,153 + 10% = 10,068.30 -> 10,100); a typed price is kept.
 */
export function resolveUnitPrice(input: UnitPriceInput): ResolvedUnitPrice {
  if (input.vendorPriceMinor != null && input.marginType) {
    const vendor = paise(input.vendorPriceMinor);
    const marginValue = paise(input.marginValue);
    const margin =
      input.marginType === 'percent' ? Math.round((vendor * marginValue) / 10000) : marginValue;
    return {
      unitPriceMinor: roundUpTo(vendor + margin, input.roundStepMinor),
      vendorPriceMinor: vendor,
      marginType: input.marginType,
      marginValue,
    };
  }
  return {
    unitPriceMinor: paise(input.unitPriceMinor),
    vendorPriceMinor: null,
    marginType: null,
    marginValue: 0,
  };
}

/** Splits `total` across `weights` so the shares always add back up to `total`. */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) {
    return weights.map(() => 0);
  }
  const raw = weights.map((w) => (total * w) / sum);
  const shares = raw.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

export function computeQuotationTotals(
  items: QuotationLineInput[],
  options: { charges?: QuotationChargeInput[]; discountMinor?: number; gstInclusive?: boolean } = {},
): QuotationTotals {
  const charges = options.charges ?? [];
  const bases = [
    ...items.map((item) =>
      Math.max(0, Math.round(wholeQuantity(item.quantity) * paise(item.unitPriceMinor))),
    ),
    ...charges.map((charge) => paise(charge.amountMinor)),
  ];
  const rates = [...items.map((i) => clampBps(i.taxBps)), ...charges.map((c) => clampBps(c.taxBps))];
  const subtotalMinor = bases.reduce((sum, v) => sum + v, 0);
  const discountMinor = Math.min(subtotalMinor, paise(options.discountMinor));
  const shares = allocateProportionally(discountMinor, bases);
  const inclusive = options.gstInclusive === true;
  const amounts = bases.map((extendedMinor, index): QuotationLineAmounts => {
    const discount = shares[index] ?? 0;
    const net = extendedMinor - discount;
    const rate = rates[index] ?? 0;
    if (inclusive) {
      // Prices already contain GST: split it out of what the customer pays.
      const taxableMinor = Math.round((net * 10000) / (10000 + rate));
      return { extendedMinor, discountMinor: discount, taxableMinor, taxMinor: net - taxableMinor, lineTotalMinor: net };
    }
    const taxMinor = Math.round((net * rate) / 10000);
    return { extendedMinor, discountMinor: discount, taxableMinor: net, taxMinor, lineTotalMinor: net + taxMinor };
  });
  const taxMinor = amounts.reduce((sum, line) => sum + line.taxMinor, 0);
  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: amounts.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    lines: amounts.slice(0, items.length),
    charges: amounts.slice(items.length),
  };
}

/** Internal profit: selling minus purchase on vendor-priced lines, less the total discount. */
export function profitAfterDiscount(
  items: Array<{ quantity: number; unitPriceMinor: number; vendorPriceMinor: number | null }>,
  discountMinor: number,
): number {
  const margin = items.reduce(
    (sum, item) =>
      item.vendorPriceMinor == null
        ? sum
        : sum + wholeQuantity(item.quantity) * (paise(item.unitPriceMinor) - paise(item.vendorPriceMinor)),
    0,
  );
  return margin - paise(discountMinor);
}
