import { parseLeadPhone } from '../../crm-leads/domain/lead-validation';

export const SEARCH_FIELD = {
  customer: 'customer',
  mobile: 'mobile',
  leadId: 'lead_id',
  quotationNumber: 'quotation_number',
} as const;

export type SearchField = (typeof SEARCH_FIELD)[keyof typeof SEARCH_FIELD];

export const SEARCH_FIELDS = Object.values(SEARCH_FIELD);

export const SEARCH_CATALOG: Array<{
  code: SearchField;
  name: string;
  description: string;
  placeholder: string;
}> = [
  {
    code: SEARCH_FIELD.customer,
    name: 'Customer',
    description: 'Customer name on the lead',
    placeholder: 'Name',
  },
  {
    code: SEARCH_FIELD.mobile,
    name: 'Mobile',
    description: 'Lead mobile number',
    placeholder: 'Phone',
  },
  {
    code: SEARCH_FIELD.leadId,
    name: 'Lead ID',
    description: 'Lead number or UUID',
    placeholder: 'LD-2026-000123',
  },
  {
    code: SEARCH_FIELD.quotationNumber,
    name: 'Quotation Number',
    description: 'Quotation document number',
    placeholder: 'QT-2026-000123',
  },
];

export const SEARCH_LIMITS = {
  minCustomer: 2,
  minMobileDigits: 4,
  minDocument: 2,
  defaultLimit: 20,
  maxLimit: 50,
  cacheTtlSeconds: 20,
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_COMPACT_RE = /^([A-Z]{2})-?(\d{4})-?(\d{1,6})$/;
const DOC_PREFIX_RE = /^([A-Z]{2})(?:-(\d{0,4}))?(?:-(\d{0,6}))?$/;

export type SearchStrategy = 'exact' | 'prefix' | 'contains' | 'phone_exact';

export type SearchPlan = {
  field: SearchField;
  strategy: SearchStrategy;
  raw: string;
  normalized: string;
  variants: string[];
  cacheKey: string;
};

export type SearchPlanResult =
  | { ok: true; plan: SearchPlan }
  | { ok: false; reason: 'empty' | 'too_short'; field: SearchField | null };

export function isSearchField(value: string): value is SearchField {
  return (SEARCH_FIELDS as string[]).includes(value);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function normalizeDocumentNumber(raw: string): string {
  const compact = raw.toUpperCase().replace(/[\s_]+/g, '');
  const full = compact.match(DOC_COMPACT_RE);
  if (full) {
    const prefix = full[1] ?? 'LD';
    const year = full[2] ?? '';
    const seq = (full[3] ?? '').padStart(6, '0');
    return `${prefix}-${year}-${seq}`;
  }
  const partial = compact.match(DOC_PREFIX_RE);
  if (partial && (partial[2] || compact.includes('-'))) {
    const prefix = partial[1] ?? compact.slice(0, 2);
    const year = partial[2] ?? '';
    const seq = partial[3] ?? '';
    if (!year) {
      return prefix;
    }
    if (!seq) {
      return `${prefix}-${year}`;
    }
    return `${prefix}-${year}-${seq}`;
  }
  return compact;
}

export function phoneVariants(raw: string): string[] {
  const variants = new Set<string>();
  const parsed = parseLeadPhone(raw);
  if (parsed.ok && parsed.value) {
    variants.add(parsed.value);
  }
  const digits = digitsOnly(raw);
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    variants.add(`+91${last10}`);
    variants.add(`+${digits}`);
  }
  return [...variants];
}

export function classifySearchField(raw: string): SearchField {
  const trimmed = raw.trim();
  if (isUuid(trimmed)) {
    return SEARCH_FIELD.leadId;
  }
  const compact = trimmed.toUpperCase().replace(/[\s_]+/g, '');
  if (compact.startsWith('QT')) {
    return SEARCH_FIELD.quotationNumber;
  }
  if (compact.startsWith('LD')) {
    return SEARCH_FIELD.leadId;
  }
  const digits = digitsOnly(trimmed);
  const letters = trimmed.replace(/[^A-Za-z]/g, '').length;
  if (digits.length >= 6 && letters === 0) {
    const parsed = parseLeadPhone(trimmed);
    if (parsed.ok && parsed.value) {
      return SEARCH_FIELD.mobile;
    }
    if (digits.length >= 10) {
      return SEARCH_FIELD.mobile;
    }
    return SEARCH_FIELD.leadId;
  }
  return SEARCH_FIELD.customer;
}

export function planSearch(raw: string, by?: SearchField | null): SearchPlanResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', field: by ?? null };
  }
  const field = by ?? classifySearchField(trimmed);
  if (field === SEARCH_FIELD.customer) {
    if (trimmed.length < SEARCH_LIMITS.minCustomer) {
      return { ok: false, reason: 'too_short', field };
    }
    const normalized = trimmed.replace(/\s+/g, ' ');
    return {
      ok: true,
      plan: {
        field,
        strategy: 'contains',
        raw: trimmed,
        normalized,
        variants: [normalized],
        cacheKey: `customer:${normalized.toLowerCase()}`,
      },
    };
  }
  if (field === SEARCH_FIELD.mobile) {
    const digits = digitsOnly(trimmed);
    if (digits.length < SEARCH_LIMITS.minMobileDigits) {
      return { ok: false, reason: 'too_short', field };
    }
    const variants = phoneVariants(trimmed);
    const strategy: SearchStrategy = variants.length > 0 ? 'phone_exact' : 'contains';
    return {
      ok: true,
      plan: {
        field,
        strategy,
        raw: trimmed,
        normalized: digits,
        variants: variants.length > 0 ? variants : [digits],
        cacheKey: `mobile:${digits}`,
      },
    };
  }
  if (field === SEARCH_FIELD.leadId && isUuid(trimmed)) {
    const id = trimmed.toLowerCase();
    return {
      ok: true,
      plan: {
        field,
        strategy: 'exact',
        raw: trimmed,
        normalized: id,
        variants: [id],
        cacheKey: `lead_uuid:${id}`,
      },
    };
  }
  if (trimmed.length < SEARCH_LIMITS.minDocument) {
    return { ok: false, reason: 'too_short', field };
  }
  const normalized = normalizeDocumentNumber(trimmed);
  const looksComplete = /^[A-Z]{2}-\d{4}-\d{6}$/.test(normalized);
  return {
    ok: true,
    plan: {
      field,
      strategy: looksComplete ? 'exact' : 'prefix',
      raw: trimmed,
      normalized,
      variants: [normalized],
      cacheKey: `${field}:${normalized}`,
    },
  };
}

export function scoreHit(params: {
  strategy: SearchStrategy;
  matchedValue: string;
  normalized: string;
}): number {
  const value = params.matchedValue.toUpperCase();
  const needle = params.normalized.toUpperCase();
  if (value === needle || value.replace(/\D/g, '') === params.normalized) {
    return 100;
  }
  if (value.startsWith(needle)) {
    return 85;
  }
  if (params.strategy === 'phone_exact') {
    return 90;
  }
  if (value.includes(needle)) {
    return 60;
  }
  return 40;
}

export function catalogEntry(code: SearchField) {
  return SEARCH_CATALOG.find((entry) => entry.code === code);
}
