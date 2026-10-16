// Pure helpers for the sales feature (tested in logic.test.ts).
import type {
  Quotation,
  QuotationItem,
  QuotationItemInput,
  QuotationTax,
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

export type LineAmounts = {
  extendedMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
};

export function lineAmounts(item: { quantity: number; unitPriceMinor: number; discountMinor: number; taxBps: number }): LineAmounts {
  const quantity = wholeQuantity(item.quantity);
  const unit = Math.max(0, Math.trunc(item.unitPriceMinor));
  const discount = Math.max(0, Math.trunc(item.discountMinor));
  const taxBps = Math.min(10000, Math.max(0, Math.trunc(item.taxBps)));
  const extendedMinor = Math.max(0, Math.round(quantity * unit));
  const discountMinor = Math.min(extendedMinor, discount);
  const taxableMinor = extendedMinor - discountMinor;
  const taxMinor = Math.round((taxableMinor * taxBps) / 10000);
  return { extendedMinor, discountMinor, taxableMinor, taxMinor, lineTotalMinor: taxableMinor + taxMinor };
}

export type QuotationTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: LineAmounts[];
};

export function computeTotals(
  items: Array<{ quantity: number; unitPriceMinor: number; discountMinor: number; taxBps: number }>,
): QuotationTotals {
  const lines = items.map(lineAmounts);
  const subtotalMinor = lines.reduce((s, l) => s + l.extendedMinor, 0);
  const discountMinor = lines.reduce((s, l) => s + l.discountMinor, 0);
  const taxMinor = lines.reduce((s, l) => s + l.taxMinor, 0);
  return { subtotalMinor, discountMinor, taxMinor, totalMinor: subtotalMinor - discountMinor + taxMinor, lines };
}

// ---------------------------------------------------------------- quotation line drafts

export type QuotationLineDraft = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  /** Free-text tax % — only used when the tenant has no managed taxes. */
  taxPct: string;
  taxRateIds: string[];
};

let keySeq = 0;
export const nextKey = () => `l${++keySeq}`;

/** Mobile defaults: qty 1, discount 0, 18% tax (GST 18 when taxes are managed). */
export function newQuotationLine(taxes: QuotationTax[]): QuotationLineDraft {
  return {
    key: nextKey(),
    productId: '',
    description: '',
    quantity: '1',
    unitPrice: '',
    discount: '0',
    taxPct: '18',
    taxRateIds: defaultTaxIds(taxes),
  };
}

export function defaultTaxIds(taxes: QuotationTax[]): string[] {
  const gst = taxes.find((t) => t.code === 'gst_18' || t.rateBps === 1800);
  return gst ? [gst.id] : [];
}

export function lineFromItem(item: QuotationItem): QuotationLineDraft {
  return {
    key: nextKey(),
    productId: item.productId ?? '',
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: minorToInput(item.unitPriceMinor),
    discount: minorToInput(item.discountMinor),
    taxPct: String(item.taxBps / 100),
    taxRateIds: [...item.taxRateIds],
  };
}

/** Same rule as QuotationsService.hydrateTaxes: managed taxes are summed, capped at 100%. */
export function lineTaxBps(line: Pick<QuotationLineDraft, 'taxRateIds' | 'taxPct'>, taxes: QuotationTax[]): number {
  if (line.taxRateIds.length) {
    const byId = new Map(taxes.map((t) => [t.id, t.rateBps]));
    return Math.min(10000, line.taxRateIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0));
  }
  const pct = Number(line.taxPct.trim());
  if (!Number.isFinite(pct)) return 0;
  return Math.min(10000, Math.max(0, Math.round(pct * 100)));
}

export function draftAmounts(line: QuotationLineDraft, taxes: QuotationTax[]) {
  return {
    quantity: wholeQuantity(line.quantity),
    unitPriceMinor: parseRupees(line.unitPrice) ?? 0,
    discountMinor: parseRupees(line.discount) ?? 0,
    taxBps: lineTaxBps(line, taxes),
  };
}

export function isBlankLine(line: QuotationLineDraft | WarrantyLineDraft): boolean {
  return !line.productId && line.description.trim() === '' && ('unitPrice' in line ? line.unitPrice.trim() === '' : true);
}

export type LineErrors = Partial<Record<'description' | 'quantity' | 'unitPrice' | 'discount' | 'taxPct', string>>;

export function validateQuotationLines(
  lines: QuotationLineDraft[],
  taxes: QuotationTax[],
): { items: QuotationItemInput[]; errors: Record<string, LineErrors>; message: string | null } {
  const items: QuotationItemInput[] = [];
  const errors: Record<string, LineErrors> = {};
  for (const line of lines) {
    if (isBlankLine(line)) continue;
    const e: LineErrors = {};
    const description = line.description.trim();
    if (description.length < 2) e.description = 'At least 2 characters.';
    else if (description.length > 240) e.description = 'At most 240 characters.';
    const qty = Number(line.quantity.trim());
    if (!Number.isInteger(qty) || qty < 1) e.quantity = 'Whole number, 1 or more.';
    const unit = parseRupees(line.unitPrice);
    if (unit === null || unit < 0) e.unitPrice = 'Enter a valid price.';
    const discount = parseRupees(line.discount);
    if (discount === null || discount < 0) e.discount = 'Enter a valid discount.';
    if (!line.taxRateIds.length) {
      const pct = Number(line.taxPct.trim() || '0');
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) e.taxPct = '0 to 100.';
    }
    if (Object.keys(e).length) {
      errors[line.key] = e;
      continue;
    }
    items.push({
      ...(line.productId ? { productId: line.productId } : {}),
      description,
      quantity: qty,
      unitPriceMinor: unit ?? 0,
      discountMinor: discount ?? 0,
      ...(line.taxRateIds.length ? { taxRateIds: line.taxRateIds } : { taxBps: lineTaxBps(line, taxes) }),
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

/** Existing line → API input (used when deleting a single line from the detail page). */
export function quotationItemToInput(row: QuotationItem): QuotationItemInput {
  return {
    ...(row.productId ? { productId: row.productId } : {}),
    description: row.description,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor,
    discountMinor: row.discountMinor,
    ...(row.taxRateIds.length ? { taxRateIds: row.taxRateIds } : { taxBps: row.taxBps }),
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
