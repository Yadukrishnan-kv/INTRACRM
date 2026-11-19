// Pure helpers for the sales feature (tested in logic.test.ts).
import type {
  Quotation,
  QuotationCharge,
  QuotationChargeInput,
  QuotationItem,
  QuotationItemInput,
  WarrantyItem,
  WarrantyItemInput,
} from './types';

// ---------------------------------------------------------------- numbers

/** Mirrors apps/api/src/common/whole-quantity.ts. */
export function wholeQuantity(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

/** Rupees typed by a user → paise. Blank → 0, garbage → null. */
export function parseRupees(value: string): number | null {
  const text = value.replace(/,/g, '').trim();
  if (text === '') return 0;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Paise → editable rupee string ("1250.5"). */
export function minorToInput(minor: number): string {
  return String(minor / 100);
}

// ---------------------------------------------------------------- totals
// Port of apps/api/src/modules/quotations/domain/quotation-totals.ts so the
// form preview matches what the server stores.

export const DEFAULT_GST_BPS = 1800;

export type LineAmounts = {
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
  lines: LineAmounts[];
  charges: LineAmounts[];
};

const clampBps = (bps: number) => Math.min(10000, Math.max(0, Math.trunc(bps)));
const paise = (v: number | null | undefined) => Math.max(0, Math.trunc(v ?? 0));

/** Splits `total` over `weights`; the shares always add back up to `total`. */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const shares = raw.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = raw.map((v, index) => ({ index, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

export function computeTotals(
  items: Array<{ quantity: number; unitPriceMinor: number; taxBps: number }>,
  options: {
    charges?: Array<{ amountMinor: number; taxBps: number }>;
    discountMinor?: number;
    gstInclusive?: boolean;
  } = {},
): QuotationTotals {
  const charges = options.charges ?? [];
  const bases = [
    ...items.map((i) => Math.max(0, Math.round(wholeQuantity(i.quantity) * paise(i.unitPriceMinor)))),
    ...charges.map((c) => paise(c.amountMinor)),
  ];
  const rates = [...items.map((i) => clampBps(i.taxBps)), ...charges.map((c) => clampBps(c.taxBps))];
  const subtotalMinor = bases.reduce((s, v) => s + v, 0);
  const discountMinor = Math.min(subtotalMinor, paise(options.discountMinor));
  const shares = allocateProportionally(discountMinor, bases);
  const inclusive = options.gstInclusive === true;
  const amounts = bases.map((extendedMinor, i): LineAmounts => {
    const discount = shares[i] ?? 0;
    const net = extendedMinor - discount;
    const rate = rates[i] ?? 0;
    if (inclusive) {
      const taxableMinor = Math.round((net * 10000) / (10000 + rate));
      return { extendedMinor, discountMinor: discount, taxableMinor, taxMinor: net - taxableMinor, lineTotalMinor: net };
    }
    const taxMinor = Math.round((net * rate) / 10000);
    return { extendedMinor, discountMinor: discount, taxableMinor: net, taxMinor, lineTotalMinor: net + taxMinor };
  });
  return {
    subtotalMinor,
    discountMinor,
    taxMinor: amounts.reduce((s, l) => s + l.taxMinor, 0),
    totalMinor: amounts.reduce((s, l) => s + l.lineTotalMinor, 0),
    lines: amounts.slice(0, items.length),
    charges: amounts.slice(items.length),
  };
}

export const roundUpTo = (amountMinor: number, stepMinor: number) =>
  stepMinor > 1 ? Math.ceil(amountMinor / stepMinor) * stepMinor : amountMinor;

// ---------------------------------------------------------------- quotation line drafts

export type QuotationLineDraft = {
  key: string;
  productId: string;
  itemCode: string;
  description: string;
  width: string;
  height: string;
  unit: string;
  quantity: string;
  /** Purchase (vendor) price — internal. When set, the unit price is computed from it. */
  purchasePrice: string;
  /** Margin % over the purchase price. */
  marginPct: string;
  /** Typed selling price, used when there is no purchase price. */
  unitPrice: string;
};

export type ChargeDraft = { key: string; description: string; amount: string };

let keySeq = 0;
export const nextKey = () => `l${++keySeq}`;

export const bpsToPct = (bps: number) => String(Number((bps / 100).toFixed(2)));

export const CHARGE_PRESETS = ['Transportation Charge', 'Installation Charge', 'Unloading Charge', 'Other Charges'];

export function newQuotationLine(): QuotationLineDraft {
  return {
    key: nextKey(),
    productId: '',
    itemCode: '',
    description: '',
    width: '',
    height: '',
    unit: 'Nos',
    quantity: '1',
    purchasePrice: '',
    marginPct: '',
    unitPrice: '',
  };
}

export const presetCharges = (): ChargeDraft[] =>
  CHARGE_PRESETS.map((description) => ({ key: nextKey(), description, amount: '' }));

export function lineFromItem(item: QuotationItem): QuotationLineDraft {
  const vendor = item.vendorPriceMinor != null && item.marginType != null;
  return {
    key: nextKey(),
    productId: item.productId ?? '',
    itemCode: item.itemCode ?? '',
    description: item.description,
    width: item.width == null ? '' : String(item.width),
    height: item.height == null ? '' : String(item.height),
    unit: item.unit || 'Nos',
    quantity: String(item.quantity),
    purchasePrice: vendor ? minorToInput(item.vendorPriceMinor!) : '',
    marginPct: vendor ? (item.marginType === 'percent' ? bpsToPct(item.marginValue) : '') : '',
    unitPrice: minorToInput(item.unitPriceMinor),
  };
}

/** Charges of an existing quotation, keeping the standard rows even when unused. */
export function chargesFromRows(rows: QuotationCharge[]): ChargeDraft[] {
  const list = presetCharges();
  for (const row of rows) {
    const slot = list.find((c) => c.description === row.description && c.amount === '');
    if (slot) slot.amount = minorToInput(row.amountMinor);
    else list.push({ key: nextKey(), description: row.description, amount: minorToInput(row.amountMinor) });
  }
  return list;
}

export function gstBps(pctText: string): number | null {
  const pct = Number(pctText.trim() === '' ? '0' : pctText.trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Math.round(pct * 100);
}

const hasPurchase = (line: QuotationLineDraft) => line.purchasePrice.trim() !== '';

/** Selling unit price for a draft line, as the server will compute it. */
export function draftUnitPriceMinor(line: QuotationLineDraft, roundStepMinor: number): number {
  if (!hasPurchase(line)) return parseRupees(line.unitPrice) ?? 0;
  const purchase = parseRupees(line.purchasePrice) ?? 0;
  const pct = Number(line.marginPct.trim() === '' ? '0' : line.marginPct.trim());
  const marginBps = Number.isFinite(pct) && pct >= 0 ? Math.round(pct * 100) : 0;
  return roundUpTo(purchase + Math.round((purchase * marginBps) / 10000), roundStepMinor);
}

export function draftAmounts(line: QuotationLineDraft, roundStepMinor: number, taxBps: number) {
  return { quantity: wholeQuantity(line.quantity), unitPriceMinor: draftUnitPriceMinor(line, roundStepMinor), taxBps };
}

export function draftChargeAmounts(charge: ChargeDraft, taxBps: number) {
  return { amountMinor: parseRupees(charge.amount) ?? 0, taxBps };
}

/** Internal profit: margin on purchase-priced lines less the total discount (paise). */
export function draftProfitMinor(lines: QuotationLineDraft[], roundStepMinor: number, discountMinor: number): number {
  const margin = lines.reduce((sum, l) => {
    if (!hasPurchase(l)) return sum;
    return sum + wholeQuantity(l.quantity) * (draftUnitPriceMinor(l, roundStepMinor) - (parseRupees(l.purchasePrice) ?? 0));
  }, 0);
  return margin - discountMinor;
}

export function isBlankLine(line: QuotationLineDraft | WarrantyLineDraft): boolean {
  if (!('purchasePrice' in line)) {
    return !line.productId && line.description.trim() === '';
  }
  return (
    !line.productId &&
    line.itemCode.trim() === '' &&
    line.description.trim() === '' &&
    line.unitPrice.trim() === '' &&
    line.purchasePrice.trim() === ''
  );
}

export type LineErrors = Partial<
  Record<'description' | 'quantity' | 'unitPrice' | 'purchasePrice' | 'marginPct' | 'width' | 'height', string>
>;

function optionalNumber(text: string): number | null | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateQuotationLines(
  lines: QuotationLineDraft[],
  taxBps: number,
): { items: QuotationItemInput[]; errors: Record<string, LineErrors>; message: string | null } {
  const items: QuotationItemInput[] = [];
  const errors: Record<string, LineErrors> = {};
  for (const line of lines) {
    if (isBlankLine(line)) continue;
    const e: LineErrors = {};
    const description = line.description.trim();
    if (description.length < 2) e.description = 'At least 2 characters.';
    else if (description.length > 1000) e.description = 'At most 1000 characters.';
    const qty = Number(line.quantity.trim());
    if (!Number.isInteger(qty) || qty < 1) e.quantity = 'Whole number, 1 or more.';
    const width = optionalNumber(line.width);
    const height = optionalNumber(line.height);
    if (width === null) e.width = 'Enter a number.';
    if (height === null) e.height = 'Enter a number.';
    const price: Partial<QuotationItemInput> = {};
    if (hasPurchase(line)) {
      const purchase = parseRupees(line.purchasePrice);
      if (purchase === null || purchase <= 0) e.purchasePrice = 'Enter the purchase price.';
      const pct = Number(line.marginPct.trim() === '' ? '0' : line.marginPct.trim());
      if (!Number.isFinite(pct) || pct < 0) e.marginPct = 'Enter a valid margin %.';
      if (!e.purchasePrice && !e.marginPct) {
        price.vendorPriceMinor = purchase ?? 0;
        price.marginType = 'percent';
        price.marginValue = Math.round(pct * 100);
      }
    } else {
      const unit = parseRupees(line.unitPrice);
      if (unit === null || unit < 0) e.unitPrice = 'Enter a valid price.';
      else price.unitPriceMinor = unit;
    }
    if (Object.keys(e).length) {
      errors[line.key] = e;
      continue;
    }
    items.push({
      ...(line.productId ? { productId: line.productId } : {}),
      ...(line.itemCode.trim() ? { itemCode: line.itemCode.trim() } : {}),
      description,
      quantity: qty,
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
      unit: line.unit.trim() || 'Nos',
      taxBps,
      ...price,
    });
  }
  const message = Object.keys(errors).length
    ? 'Fix the highlighted line items.'
    : items.length === 0
      ? 'Add at least one line item.'
      : items.length > 50
        ? 'A quotation can have at most 50 line items.'
        : null;
  return { items, errors, message };
}

export function validateCharges(
  charges: ChargeDraft[],
  taxBps: number,
): { charges: QuotationChargeInput[]; errors: Record<string, string> } {
  const out: QuotationChargeInput[] = [];
  const errors: Record<string, string> = {};
  for (const c of charges) {
    if (c.amount.trim() === '') continue;
    const amount = parseRupees(c.amount);
    if (c.description.trim().length < 2) errors[c.key] = 'Describe the charge.';
    else if (amount === null || amount < 0) errors[c.key] = 'Enter a valid amount.';
    else if (amount > 0) out.push({ description: c.description.trim(), amountMinor: amount, taxBps });
  }
  return { charges: out, errors };
}

/** Existing line → API input (used when deleting a single line from the detail page). */
export function quotationItemToInput(row: QuotationItem): QuotationItemInput {
  const vendor = row.vendorPriceMinor != null && row.marginType != null;
  return {
    ...(row.productId ? { productId: row.productId } : {}),
    ...(row.itemCode ? { itemCode: row.itemCode } : {}),
    description: row.description,
    quantity: row.quantity,
    ...(row.width != null ? { width: row.width } : {}),
    ...(row.height != null ? { height: row.height } : {}),
    unit: row.unit,
    taxBps: row.taxBps,
    ...(vendor
      ? { vendorPriceMinor: row.vendorPriceMinor!, marginType: row.marginType!, marginValue: row.marginValue }
      : { unitPriceMinor: row.unitPriceMinor }),
  };
}

// ---------------------------------------------------------------- quotation list / status

export type QuotationFilter = { status?: string; leadId?: string; pending?: boolean; bucket?: string };

/** Mirrors QuotationListController._load: a bucket wins over pending, which wins over status. */
export function quotationListQuery(filter: QuotationFilter): QuotationFilter {
  const bucket = filter.bucket || undefined;
  const pending = !bucket && !!filter.pending;
  return {
    leadId: filter.leadId || undefined,
    bucket,
    pending: pending || undefined,
    status: bucket || pending ? undefined : filter.status || undefined,
  };
}

export const isDraft = (q: Pick<Quotation, 'status'>) => q.status === 'draft';
/** Anything not yet won/lost can still be edited (a sent quotation becomes a new revision). */
export const isEditable = (q: Pick<Quotation, 'status'>) => !['won', 'lost'].includes(q.status);
export const isPending = (q: Pick<Quotation, 'status'>) => !['draft', 'won', 'lost'].includes(q.status);

/** Status buttons offered on the detail page (send has its own action). */
export function statusActions(q: Pick<Quotation, 'nextStatuses'>): string[] {
  return q.nextStatuses.filter((s) => s !== 'sent');
}

export function statusActionLabel(status: string, labels: Record<string, string>): string {
  if (status === 'lost') return 'Mark lost';
  if (status === 'won') return 'Mark won';
  return `Move to ${labels[status] ?? status}`;
}

export function quotationTone(status: string): string {
  switch (status) {
    case 'won':
    case 'approved':
      return 'success';
    case 'lost':
      return 'danger';
    case 'draft':
      return 'neutral';
    case 'negotiation':
    case 'customer_deciding':
      return 'warning';
    default:
      return 'info';
  }
}

export function warrantyTone(status: string): string {
  switch (status) {
    case 'active':
      return 'success';
    case 'void':
      return 'danger';
    case 'claimed':
      return 'warning';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysYmd(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/** Port of addMonthsYmd in warranty-types.ts (clamps to the last day of month). */
export function addMonthsYmd(value: string, months: number): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)));
  return next.toISOString().slice(0, 10);
}

/** Mobile _periodLabel: "2 Years" / "18 Months". */
export function warrantyPeriodLabel(start: string, end: string): string {
  const s = /^(\d{4})-(\d{2})/.exec(start);
  const e = /^(\d{4})-(\d{2})/.exec(end);
  if (!s || !e) return `${start} – ${end}`;
  const months = (Number(e[1]) - Number(s[1])) * 12 + (Number(e[2]) - Number(s[2]));
  if (months >= 12 && months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? 'Year' : 'Years'}`;
  }
  return `${months} Months`;
}

// ---------------------------------------------------------------- warranties

export type WarrantyLineDraft = {
  key: string;
  productId: string;
  description: string;
  serialNumber: string;
  quantity: string;
};

export function newWarrantyLine(): WarrantyLineDraft {
  return { key: nextKey(), productId: '', description: '', serialNumber: '', quantity: '1' };
}

export function warrantyLineFromItem(item: WarrantyItem): WarrantyLineDraft {
  return {
    key: nextKey(),
    productId: item.productId ?? '',
    description: item.description,
    serialNumber: item.serialNumber ?? '',
    quantity: String(item.quantity),
  };
}

export function validateWarrantyLines(lines: WarrantyLineDraft[]): {
  items: WarrantyItemInput[];
  errors: Record<string, Partial<Record<'description' | 'quantity' | 'serialNumber', string>>>;
  message: string | null;
} {
  const items: WarrantyItemInput[] = [];
  const errors: Record<string, Partial<Record<'description' | 'quantity' | 'serialNumber', string>>> = {};
  for (const line of lines) {
    if (isBlankLine(line) && !line.serialNumber.trim()) continue;
    const e: Partial<Record<'description' | 'quantity' | 'serialNumber', string>> = {};
    const description = line.description.trim();
    if (description.length < 2) e.description = 'At least 2 characters.';
    else if (description.length > 240) e.description = 'At most 240 characters.';
    const qty = Number(line.quantity.trim());
    if (!Number.isInteger(qty) || qty < 1) e.quantity = 'Whole number, 1 or more.';
    if (line.serialNumber.trim().length > 80) e.serialNumber = 'At most 80 characters.';
    if (Object.keys(e).length) {
      errors[line.key] = e;
      continue;
    }
    items.push({
      ...(line.productId ? { productId: line.productId } : {}),
      description,
      quantity: qty,
      ...(line.serialNumber.trim() ? { serialNumber: line.serialNumber.trim() } : {}),
    });
  }
  const message = Object.keys(errors).length
    ? 'Fix the highlighted items.'
    : items.length === 0
      ? 'Add at least one covered item.'
      : items.length > 50
        ? 'At most 50 covered items.'
        : null;
  return { items, errors, message };
}

export function warrantyItemToInput(row: WarrantyItem): WarrantyItemInput {
  return {
    ...(row.productId ? { productId: row.productId } : {}),
    description: row.description,
    quantity: row.quantity,
    ...(row.serialNumber ? { serialNumber: row.serialNumber } : {}),
  };
}

/**
 * Accepts a verification URL (…/public/warranty/<token>/view or this console's
 * /verify-warranty/<token>) or a bare token. Real tokens are 48 hex chars (the
 * mobile parser); older/demo tokens are accepted as plain slugs since the
 * verify endpoint looks them up as-is.
 */
export function parseWarrantyToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hexUrl = /public\/warranty\/([a-fA-F0-9]{48})(?:\/|$|\?|#)/.exec(trimmed);
  if (hexUrl?.[1]) return hexUrl[1].toLowerCase();
  if (/^[a-fA-F0-9]{48}$/.test(trimmed)) return trimmed.toLowerCase();
  const anyUrl = /(?:public\/warranty|verify-warranty)\/([A-Za-z0-9_-]{4,128})(?:\/|$|\?|#)/.exec(trimmed);
  if (anyUrl?.[1]) return anyUrl[1];
  if (/^[A-Za-z0-9_-]{4,128}$/.test(trimmed)) return trimmed;
  return null;
}

// ---------------------------------------------------------------- files

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------- closing prediction

export function bandTitle(band: string): string {
  switch (band) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'won':
      return 'Won';
    case 'lost':
      return 'Lost';
    default:
      return band;
  }
}

/** Mobile Quotation.predictionLabel: "65% · Medium". */
export function predictionLabel(q: Pick<Quotation, 'closingPrediction'>): string {
  const p = q.closingPrediction;
  if (!p) return '—';
  return `${Math.round(p.probabilityBps / 100)}% · ${bandTitle(p.band)}`;
}

export function predictionPercent(q: Pick<Quotation, 'closingPrediction'>): number {
  const bps = q.closingPrediction?.probabilityBps ?? 0;
  return Math.min(100, Math.max(0, bps / 100));
}

export const displayQuotationTitle = (q: Pick<Quotation, 'title' | 'quotationNumber'>) =>
  q.title?.trim() ? q.title : q.quotationNumber;

/** Warranty end date implied by the longest product warranty on the lines (mobile _applyProduct). */
export function impliedWarrantyEnd(start: string, months: Array<number | null | undefined>): string | null {
  const valid = months.filter((m): m is number => typeof m === 'number' && m > 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || valid.length === 0) return null;
  return addMonthsYmd(start, Math.max(...valid));
}

/** Prefill covered items from a quotation's lines when issuing a warranty from it. */
export function warrantyLinesFromQuotation(items: QuotationItem[]): WarrantyLineDraft[] {
  return items.map((item) => ({
    key: nextKey(),
    productId: item.productId ?? '',
    description: item.description,
    serialNumber: '',
    quantity: String(item.quantity),
  }));
}

/** Formats a calendar date ("2026-10-20") without the UTC shift `new Date(ymd)` causes. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d);
}
