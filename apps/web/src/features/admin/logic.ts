import { rupeesToMinor } from '../../components/form';
import {
  CATALOG_KINDS,
  type AuthSessionRow,
  type CatalogItem,
  type CatalogKind,
  type CatalogPayload,
  type Permission,
  type StaffInput,
  type StaffMember,
  type TaxBatchItem,
} from './api';

/* ---------- Passwords (mirrors apps/api identity/domain/password.policy.ts) ---------- */

export const MIN_PASSWORD_LENGTH = 10;
const LETTER_AND_NUMBER = /^(?=.*[A-Za-z])(?=.*\d).+$/;

/** Same rule the API enforces (and the mobile PasswordRules): null when valid. */
export function validatePassword(password: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!LETTER_AND_NUMBER.test(password)) return 'Password must include at least one letter and one number.';
  const local = email?.split('@')[0]?.trim().toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'Password must not contain your email name.';
  return null;
}

export const OTP_PATTERN = /^\d{6}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Codes ---------- */

export const ROLE_CODE_RULE = /^[a-z][a-z0-9_.]*$/;
export const CATALOG_CODE_RULE = /^[a-z][a-z0-9_]*$/;
export const PRODUCT_SKU_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/** "Walk-in Store" → "walk_in_store" (same as mobile catalogCodeFromName). */
export function catalogCodeFromName(name: string): string {
  let code = name.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!code || !/^[a-z]/.test(code)) code = `item_${code}`;
  return code;
}

/* ---------- Catalog kinds ---------- */

const KIND_LABELS: Record<CatalogKind, string> = {
  products: 'Products',
  categories: 'Categories',
  sources: 'Sources',
  'lead-statuses': 'Lead status',
  'lead-qualities': 'Lead quality',
  'warranty-periods': 'Warranty periods',
  taxes: 'Taxes',
};

export function isCatalogKind(value: string | undefined): value is CatalogKind {
  return !!value && (CATALOG_KINDS as readonly string[]).includes(value);
}

export function catalogKindLabel(kind: CatalogKind): string {
  return KIND_LABELS[kind];
}

/** Lead statuses have no active flag in the API (pipeline stages); every other kind can be deactivated. */
export function kindSupportsActive(kind: CatalogKind): boolean {
  return kind !== 'lead-statuses';
}

export function formatRate(item: Pick<CatalogItem, 'ratePercent' | 'rateBps'>): string {
  const pct = item.ratePercent ?? (item.rateBps ?? 0) / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

/** One-line description of a catalog row, as the mobile list subtitle. */
export function catalogSubtitle(kind: CatalogKind, item: CatalogItem): string {
  const bits: string[] = [];
  if (kind === 'products') bits.push(item.sku ?? '');
  else bits.push(item.code ?? '');
  if (kind === 'categories' && item.parentName) bits.push(`in ${item.parentName}`);
  if (kind === 'products' && item.categoryName) bits.push(item.categoryName);
  if (kind === 'products' && item.warrantyPeriodName) bits.push(`${item.warrantyPeriodName} warranty`);
  if (kind === 'warranty-periods' && item.months != null) bits.push(`${item.months} months`);
  if (kind === 'taxes') bits.push(formatRate(item));
  if (kind === 'lead-statuses') {
    if (item.isOpen) bits.push('Open');
    if (item.isWon) bits.push('Won');
    if (item.isLost) bits.push('Lost');
    bits.push(`${(item.winProbabilityBps ?? 0) / 100}% win`);
  }
  return bits.filter(Boolean).join(' · ');
}

/* ---------- Catalog form ---------- */

export type CatalogDraft = {
  name: string;
  code: string;
  codeTouched: boolean;
  sku: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
  parentId: string;
  categoryId: string;
  warrantyPeriodId: string;
  price: string;
  months: string;
  ratePercent: string;
  isOpen: boolean;
  isWon: boolean;
  isLost: boolean;
  winPercent: string;
};

export function emptyCatalogDraft(): CatalogDraft {
  return {
    name: '',
    code: '',
    codeTouched: false,
    sku: '',
    description: '',
    sortOrder: '0',
    isActive: true,
    parentId: '',
    categoryId: '',
    warrantyPeriodId: '',
    price: '',
    months: '',
    ratePercent: '18',
    isOpen: true,
    isWon: false,
    isLost: false,
    winPercent: '0',
  };
}

export function draftFromItem(item: CatalogItem): CatalogDraft {
  const rate = item.ratePercent ?? (item.rateBps ?? 0) / 100;
  return {
    name: item.name,
    code: item.code ?? '',
    codeTouched: true,
    sku: item.sku ?? '',
    description: item.description ?? '',
    sortOrder: String(item.sortOrder ?? 0),
    isActive: item.isActive,
    parentId: item.parentId ?? '',
    categoryId: item.categoryId ?? '',
    warrantyPeriodId: item.warrantyPeriodId ?? '',
    price: item.unitPriceMinor == null ? '' : String(item.unitPriceMinor / 100),
    months: String(item.months ?? item.warrantyMonths ?? ''),
    ratePercent: String(rate),
    isOpen: item.isOpen ?? true,
    isWon: item.isWon ?? false,
    isLost: item.isLost ?? false,
    winPercent: String((item.winProbabilityBps ?? 0) / 100),
  };
}

/** Name typed on a new item: keeps the code in sync until the user edits the code by hand. */
export function withName(kind: CatalogKind, draft: CatalogDraft, name: string, isEdit: boolean): CatalogDraft {
  const autoCode = !isEdit && !draft.codeTouched && kind !== 'products';
  return { ...draft, name, code: autoCode ? (name.trim() ? catalogCodeFromName(name) : '') : draft.code };
}

/** Lead status flags are mutually exclusive: open, won, lost. */
export function withStatusFlag(draft: CatalogDraft, flag: 'isOpen' | 'isWon' | 'isLost', value: boolean): CatalogDraft {
  if (!value) return { ...draft, [flag]: false };
  return { ...draft, isOpen: flag === 'isOpen', isWon: flag === 'isWon', isLost: flag === 'isLost' };
}

function isInt(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function validateCatalogDraft(kind: CatalogKind, d: CatalogDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = d.name.trim();
  if (name.length < 2) errors.name = 'Enter a name (at least 2 characters).';
  else if (name.length > (kind === 'products' ? 160 : 120)) errors.name = 'Name is too long.';
  if (kind === 'products') {
    if (!d.sku.trim()) errors.sku = 'Enter a SKU.';
    else if (!PRODUCT_SKU_RULE.test(d.sku.trim())) errors.sku = 'Letters, numbers, dots, dashes or underscores (max 40).';
    if (d.price.trim() && (rupeesToMinor(d.price) === undefined || (rupeesToMinor(d.price) ?? 0) < 0))
      errors.unitPriceMinor = 'Enter a valid price.';
    if (d.description.length > 2000) errors.description = 'Description is too long.';
  } else {
    const code = catalogCodeFromName(d.code);
    if (!d.code.trim() || !CATALOG_CODE_RULE.test(code) || code.length < 2 || code.length > 80)
      errors.code = 'Use a lowercase letter, then letters, numbers, or underscores.';
    if (d.sortOrder.trim() && (!isInt(d.sortOrder) || Number(d.sortOrder) > 100000))
      errors.sortOrder = 'Enter a whole number between 0 and 100000.';
  }
  if (kind === 'warranty-periods') {
    const months = Number(d.months);
    if (!isInt(d.months) || months < 1 || months > 360) errors.months = 'Enter months between 1 and 360.';
  }
  if (kind === 'taxes') {
    const rate = Number(d.ratePercent);
    if (d.ratePercent.trim() === '' || Number.isNaN(rate) || rate < 0 || rate > 100)
      errors.ratePercent = 'Enter a rate between 0 and 100.';
  }
  if (kind === 'lead-statuses') {
    const win = Number(d.winPercent);
    if (d.winPercent.trim() && (Number.isNaN(win) || win < 0 || win > 100))
      errors.winProbabilityBps = 'Enter a percentage between 0 and 100.';
    if (!d.isOpen && !d.isWon && !d.isLost) errors.flags = 'Pick open, won or lost.';
  }
  return errors;
}

/** Request body for create/update, matching the API DTO for the kind (unknown keys are rejected). */
export function catalogPayload(kind: CatalogKind, d: CatalogDraft, isEdit: boolean): CatalogPayload {
  const body: CatalogPayload = { name: d.name.trim() };
  if (kindSupportsActive(kind)) body.isActive = d.isActive;
  if (kind === 'products') {
    const description = d.description.trim();
    const price = d.price.trim();
    body.sku = d.sku.trim();
    if (d.categoryId || isEdit) body.categoryId = d.categoryId || null;
    if (d.warrantyPeriodId || isEdit) body.warrantyPeriodId = d.warrantyPeriodId || null;
    // On edit, null clears a removed description or price.
    if (description || isEdit) body.description = description || null;
    if (price || isEdit) body.unitPriceMinor = price ? (rupeesToMinor(price) ?? null) : null;
    return body;
  }
  body.code = catalogCodeFromName(d.code);
  body.sortOrder = d.sortOrder.trim() ? Number(d.sortOrder) : 0;
  if (kind === 'categories' && (d.parentId || isEdit)) body.parentId = d.parentId || null;
  if (kind === 'warranty-periods') body.months = Number(d.months);
  if (kind === 'taxes') body.ratePercent = Number(d.ratePercent);
  if (kind === 'lead-statuses') {
    body.isOpen = d.isOpen;
    body.isWon = d.isWon;
    body.isLost = d.isLost;
    body.winProbabilityBps = Math.min(10000, Math.max(0, Math.round(Number(d.winPercent || '0') * 100)));
  }
  return body;
}

/* ---------- Taxes batch ---------- */

export type TaxRow = { key: string; id?: string; name: string; rate: string; active: boolean };

export function taxRowsFromItems(items: CatalogItem[]): TaxRow[] {
  return items.map((item) => ({
    key: item.id,
    id: item.id,
    name: item.name,
    rate: String(item.ratePercent ?? (item.rateBps ?? 0) / 100),
    active: item.isActive,
  }));
}

/**
 * Builds the POST /catalog/taxes/batch body. Rows whose name is shorter than two
 * characters are skipped (as mobile); originals no longer present are deleted.
 */
export function buildTaxBatch(
  rows: TaxRow[],
  original: CatalogItem[],
): { ok: true; items: TaxBatchItem[]; deleteIds: string[] } | { ok: false; error: string } {
  const items: TaxBatchItem[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (name.length < 2) continue;
    const rate = Number(row.rate.trim() || '0');
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return { ok: false, error: `“${name}”: rate must be between 0 and 100.` };
    items.push({
      ...(row.id ? { id: row.id } : {}),
      name,
      ratePercent: rate,
      isActive: row.active,
      sortOrder: (items.length + 1) * 10,
    });
  }
  if (items.length === 0) return { ok: false, error: 'Add at least one named tax.' };
  if (items.length > 50) return { ok: false, error: 'At most 50 taxes can be saved at once.' };
  const keep = new Set(items.map((i) => i.id).filter(Boolean));
  const deleteIds = original.filter((o) => !keep.has(o.id)).map((o) => o.id);
  return { ok: true, items, deleteIds };
}

/* ---------- RBAC ---------- */

export function groupPermissions(permissions: Permission[]): Array<{ resource: string; items: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions) {
    const list = groups.get(p.resource) ?? [];
    list.push(p);
    groups.set(p.resource, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, items]) => ({ resource, items: items.sort((a, b) => a.code.localeCompare(b.code)) }));
}

export function toggleIn<T>(set: ReadonlySet<T>, value: T, on?: boolean): Set<T> {
  const next = new Set(set);
  const add = on ?? !next.has(value);
  if (add) next.add(value);
  else next.delete(value);
  return next;
}

export function sameMembers<T>(a: Iterable<T>, b: Iterable<T>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/* ---------- Staff form ---------- */

export type StaffDraft = {
  fullName: string;
  email: string;
  designation: string;
  employeeCode: string;
  roleIds: Set<string>;
  teamIds: Set<string>;
};

export function validateStaffDraft(d: StaffDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = d.fullName.trim();
  if (name.length < 2) errors.fullName = 'Name is required.';
  else if (name.length > 120) errors.fullName = 'Name is too long.';
  if (!EMAIL_PATTERN.test(d.email.trim())) errors.email = 'Enter a valid email.';
  if (d.designation.trim().length > 80) errors.designation = 'At most 80 characters.';
  if (d.employeeCode.trim().length > 40) errors.employeeCode = 'At most 40 characters.';
  if (d.roleIds.size === 0) errors.roleIds = 'Select at least one role.';
  return errors;
}

export function emptyStaffDraft(): StaffDraft {
  return { fullName: '', email: '', designation: '', employeeCode: '', roleIds: new Set(), teamIds: new Set() };
}

export function staffDraftFromMember(m: StaffMember): StaffDraft {
  return {
    fullName: m.user.fullName,
    email: m.user.email ?? '',
    designation: m.designation ?? '',
    employeeCode: m.employeeCode ?? '',
    roleIds: new Set(m.roles.map((r) => r.id)),
    teamIds: new Set(m.teams.map((t) => t.id)),
  };
}

/**
 * Body for POST /staff and PATCH /staff/:id. On create blank optional fields are
 * omitted; on edit they are sent as "" so a cleared designation is cleared (as mobile).
 */
export function staffPayload(d: StaffDraft, isEdit = false): StaffInput {
  const designation = d.designation.trim();
  const employeeCode = d.employeeCode.trim();
  return {
    fullName: d.fullName.trim(),
    email: d.email.trim().toLowerCase(),
    ...(designation || isEdit ? { designation } : {}),
    ...(employeeCode || isEdit ? { employeeCode } : {}),
    roleIds: [...d.roleIds],
    teamIds: [...d.teamIds],
  };
}

/** "Active" / "Invited" / "Inactive" for a staff row (mobile shows active vs inactive). */
export function staffStatusLabel(m: Pick<StaffMember, 'active' | 'status'>): string {
  if (m.active) return 'active';
  if (m.status === 'invited') return 'invited';
  return 'inactive';
}

/* ---------- Teams ---------- */

/** Mirrors CreateTeamRequest: name 2-80, code 2-40 (lowercased by the API). */
export function validateTeam(name: string, code?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (name.trim().length < 2) errors.name = 'Name is required.';
  else if (name.trim().length > 80) errors.name = 'At most 80 characters.';
  if (code !== undefined) {
    const c = code.trim();
    if (c.length < 2) errors.code = 'Code is required.';
    else if (c.length > 40) errors.code = 'At most 40 characters.';
  }
  return errors;
}

/* ---------- Roles ---------- */

export function validateRole(d: { name: string; code: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (d.name.trim().length < 2) errors.name = 'Name is required.';
  else if (d.name.trim().length > 120) errors.name = 'Name is too long.';
  if (!ROLE_CODE_RULE.test(d.code.trim().toLowerCase())) errors.code = 'Use lowercase letters, numbers, dots, or underscores.';
  return errors;
}

/* ---------- Sessions ---------- */

/** "Chrome on macOS" style label: device name, else the device id. */
export function sessionLabel(s: Pick<AuthSessionRow, 'deviceName' | 'deviceId'>): string {
  return s.deviceName?.trim() ? s.deviceName : s.deviceId;
}

/** Current device first, then most recently seen. */
export function sortSessions<T extends Pick<AuthSessionRow, 'isCurrent' | 'lastSeenAt'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastSeenAt.localeCompare(a.lastSeenAt));
}
