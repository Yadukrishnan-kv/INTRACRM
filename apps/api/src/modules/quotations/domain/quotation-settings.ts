import { DEFAULT_GST_BPS } from './quotation-totals';

export type SpecRow = { label: string; value: string };

export type QuotationSettings = {
  defaultGstBps: number;
  /** Vendor-priced unit prices round up to a multiple of this many paise. */
  roundingStepMinor: number;
  logoDataUrl: string;
  companyName: string;
  address: string;
  bankDetails: string;
  defaultTerms: string;
  defaultSpecs: SpecRow[];
};

export const DEFAULT_ROUNDING_STEP_MINOR = 10_000;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

export function parseSpecs(value: unknown): SpecRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const row = raw as Partial<SpecRow> | null;
    if (!row || typeof row.label !== 'string' || !row.label.trim()) return [];
    return [{ label: row.label.trim(), value: typeof row.value === 'string' ? row.value.trim() : '' }];
  });
}

/** Reads `tenant.settings.quotation`, filling defaults for anything missing. */
export function parseQuotationSettings(tenantSettings: unknown): QuotationSettings {
  const raw = ((tenantSettings as { quotation?: Record<string, unknown> } | null)?.quotation ?? {}) as Record<string, unknown>;
  return {
    defaultGstBps: int(raw.defaultGstBps, DEFAULT_GST_BPS, 0, 10000),
    roundingStepMinor: int(raw.roundingStepMinor, DEFAULT_ROUNDING_STEP_MINOR, 0, 10_000_000),
    logoDataUrl: str(raw.logoDataUrl),
    companyName: str(raw.companyName),
    address: str(raw.address),
    bankDetails: str(raw.bankDetails),
    defaultTerms: str(raw.defaultTerms),
    defaultSpecs: parseSpecs(raw.defaultSpecs),
  };
}
