import { randomBytes } from 'node:crypto';

export const WARRANTY_STATUSES = ['active', 'expired', 'claimed', 'void'] as const;
export type WarrantyStatusCode = (typeof WARRANTY_STATUSES)[number];

export const WRITABLE_WARRANTY_STATUSES = ['claimed', 'void'] as const;
export type WritableWarrantyStatus = (typeof WRITABLE_WARRANTY_STATUSES)[number];

export const ISSUABLE_QUOTATION_STATUSES = ['approved', 'won'] as const;

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatusCode, string> = {
  active: 'Active',
  expired: 'Expired',
  claimed: 'Claimed',
  void: 'Void',
};

export function isWarrantyStatus(value: string): value is WarrantyStatusCode {
  return (WARRANTY_STATUSES as readonly string[]).includes(value);
}

export function isWritableWarrantyStatus(value: string): value is WritableWarrantyStatus {
  return (WRITABLE_WARRANTY_STATUSES as readonly string[]).includes(value);
}

export function addMonthsYmd(ymd: string, months: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)));
  return next.toISOString().slice(0, 10);
}

export function defaultWarrantyEndOn(startYmd: string, warrantyMonths: number | null | undefined): string {
  return addMonthsYmd(startYmd, warrantyMonths != null && warrantyMonths > 0 ? warrantyMonths : 12);
}

export function effectiveWarrantyStatus(input: {
  status: string;
  warrantyEndOn: string;
  todayYmd: string;
}): WarrantyStatusCode {
  if (input.status === 'void' || input.status === 'claimed') {
    return input.status;
  }
  if (input.warrantyEndOn < input.todayYmd) {
    return 'expired';
  }
  return 'active';
}

export function allowedNextWarrantyStatuses(status: string): WritableWarrantyStatus[] {
  if (status === 'void') {
    return [];
  }
  if (status === 'claimed') {
    return ['void'];
  }
  return ['claimed', 'void'];
}

export function canTransitionWarranty(from: string, to: string): boolean {
  return allowedNextWarrantyStatuses(from).includes(to as WritableWarrantyStatus);
}

export function warrantyCatalog() {
  return {
    statuses: WARRANTY_STATUSES.map((code) => ({ code, title: WARRANTY_STATUS_LABELS[code] })),
  };
}

export function newVerifyToken(): string {
  return randomBytes(24).toString('hex');
}

export function warrantyVerifyUrl(baseUrl: string, apiPrefix: string, token: string): string {
  return `${warrantyPortalRoot(baseUrl, apiPrefix)}/${token}/view`;
}

export function warrantyPortalRoot(baseUrl: string, apiPrefix: string): string {
  const origin = baseUrl.replace(/\/+$/, '');
  const prefix = apiPrefix.replace(/^\/+|\/+$/g, '');
  return `${origin}/${prefix}/public/warranty`;
}

export function parseWarrantyVerifyInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const fromUrl = trimmed.match(/public\/warranty\/([a-fA-F0-9]{48})(?:\/|$|\?|#)/);
  if (fromUrl?.[1]) {
    return fromUrl[1].toLowerCase();
  }
  if (/^[a-fA-F0-9]{48}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type WarrantyVerifyView = {
  valid: boolean;
  cardNumber: string;
  status: string;
  statusLabel: string;
  serialNumber: string | null;
  customerName: string | null;
  tenantName: string;
  purchasedOn: string | null;
  warrantyStartOn: string;
  warrantyEndOn: string;
  coverageNotes: string | null;
  items: Array<{ description: string; serialNumber: string | null; quantity: number }>;
};
