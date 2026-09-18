export const CATALOG_CODE_RULE = /^[a-z][a-z0-9_]*$/;
export const PRODUCT_SKU_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export const CATALOG_KIND = {
  sources: 'sources',
  categories: 'categories',
  products: 'products',
  leadStatuses: 'lead-statuses',
  leadQualities: 'lead-qualities',
  warrantyPeriods: 'warranty-periods',
  taxes: 'taxes',
} as const;

export type CatalogKind = (typeof CATALOG_KIND)[keyof typeof CATALOG_KIND];

export const CATALOG_KINDS = [
  CATALOG_KIND.products,
  CATALOG_KIND.categories,
  CATALOG_KIND.sources,
  CATALOG_KIND.leadStatuses,
  CATALOG_KIND.leadQualities,
  CATALOG_KIND.warrantyPeriods,
  CATALOG_KIND.taxes,
] as const;

export const DEFAULT_LEAD_QUALITIES = [
  { code: 'hot', name: 'Hot', sortOrder: 10 },
  { code: 'warm', name: 'Warm', sortOrder: 20 },
  { code: 'cold', name: 'Cold', sortOrder: 30 },
] as const;

export const DEFAULT_WARRANTY_PERIODS = [
  { code: 'months_6', name: '6 months', months: 6, sortOrder: 10 },
  { code: 'months_12', name: '1 year', months: 12, sortOrder: 20 },
  { code: 'months_24', name: '2 years', months: 24, sortOrder: 30 },
  { code: 'months_36', name: '3 years', months: 36, sortOrder: 40 },
] as const;

export const DEFAULT_PRODUCT_CATEGORY = {
  code: 'doors',
  name: 'Main doors',
  sortOrder: 10,
} as const;

export const DEFAULT_TAX_RATES = [
  { code: 'gst_0', name: 'GST 0%', rateBps: 0, sortOrder: 10 },
  { code: 'gst_5', name: 'GST 5%', rateBps: 500, sortOrder: 20 },
  { code: 'gst_12', name: 'GST 12%', rateBps: 1200, sortOrder: 30 },
  { code: 'gst_18', name: 'GST 18%', rateBps: 1800, sortOrder: 40 },
  { code: 'gst_28', name: 'GST 28%', rateBps: 2800, sortOrder: 50 },
  { code: 'cgst_9', name: 'CGST 9%', rateBps: 900, sortOrder: 60 },
  { code: 'sgst_9', name: 'SGST 9%', rateBps: 900, sortOrder: 70 },
  { code: 'igst_18', name: 'IGST 18%', rateBps: 1800, sortOrder: 80 },
] as const;

export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(10000, Math.max(0, Math.round(percent * 100)));
}

export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

export function normalizeCatalogCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isCatalogCode(value: string): boolean {
  return CATALOG_CODE_RULE.test(normalizeCatalogCode(value));
}

export function isProductSku(value: string): boolean {
  return PRODUCT_SKU_RULE.test(value.trim());
}

export function catalogKindLabel(kind: CatalogKind): string {
  switch (kind) {
    case CATALOG_KIND.products:
      return 'Products';
    case CATALOG_KIND.categories:
      return 'Categories';
    case CATALOG_KIND.sources:
      return 'Sources';
    case CATALOG_KIND.leadStatuses:
      return 'Lead status';
    case CATALOG_KIND.leadQualities:
      return 'Lead quality';
    case CATALOG_KIND.warrantyPeriods:
      return 'Warranty periods';
    case CATALOG_KIND.taxes:
      return 'Taxes';
    default:
      return kind;
  }
}

export function assertStageFlags(flags: { isOpen?: boolean; isWon?: boolean; isLost?: boolean }) {
  const isWon = flags.isWon === true;
  const isLost = flags.isLost === true;
  if (isWon && isLost) {
    return { ok: false as const, message: 'A status cannot be both won and lost.' };
  }
  return {
    ok: true as const,
    isWon,
    isLost,
    isOpen: flags.isOpen ?? (!isWon && !isLost),
  };
}
