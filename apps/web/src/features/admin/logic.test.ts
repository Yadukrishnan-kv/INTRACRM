import { describe, expect, it } from 'vitest';
import type { CatalogItem, Permission, StaffMember } from './api';
import {
  buildTaxBatch,
  catalogCodeFromName,
  catalogPayload,
  catalogSubtitle,
  draftFromItem,
  emptyCatalogDraft,
  emptyStaffDraft,
  groupPermissions,
  sameMembers,
  sortSessions,
  staffDraftFromMember,
  staffPayload,
  staffStatusLabel,
  validateCatalogDraft,
  validatePassword,
  validateRole,
  validateStaffDraft,
  validateTeam,
  withName,
  withStatusFlag,
} from './logic';

const item = (over: Partial<CatalogItem>): CatalogItem => ({
  id: 'id-1',
  name: 'Item',
  isActive: true,
  version: 1,
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('validatePassword (mirrors API PasswordPolicy / mobile PasswordRules)', () => {
  it('enforces length, letter+number and email name', () => {
    expect(validatePassword('short1')).toMatch(/at least 10/);
    expect(validatePassword('onlyletterss')).toMatch(/letter and one number/);
    expect(validatePassword('ravi12345678', 'ravi@example.com')).toMatch(/email name/);
    expect(validatePassword('Str0ngPassw0rd', 'ravi@example.com')).toBeNull();
  });
});

describe('catalog codes and drafts', () => {
  it('derives a code from a name like mobile', () => {
    expect(catalogCodeFromName('Walk-in Store')).toBe('walk_in_store');
    expect(catalogCodeFromName('9 Star')).toBe('item_9_star');
  });

  it('keeps the code in sync with the name until edited by hand (not for products or edits)', () => {
    const d = withName('sources', emptyCatalogDraft(), 'Trade Show', false);
    expect(d.code).toBe('trade_show');
    expect(withName('sources', { ...d, codeTouched: true }, 'Expo', false).code).toBe('trade_show');
    expect(withName('products', emptyCatalogDraft(), 'Panel', false).code).toBe('');
    expect(withName('sources', { ...d, code: 'old' }, 'New', true).code).toBe('old');
  });

  it('makes lead status flags mutually exclusive', () => {
    const won = withStatusFlag(emptyCatalogDraft(), 'isWon', true);
    expect([won.isOpen, won.isWon, won.isLost]).toEqual([false, true, false]);
    expect(validateCatalogDraft('lead-statuses', { ...won, name: 'Won', code: 'won', isWon: false })).toHaveProperty('flags');
  });

  it('validates per kind', () => {
    const base = { ...emptyCatalogDraft(), name: 'Five years', code: 'five_years' };
    expect(validateCatalogDraft('warranty-periods', { ...base, months: '0' })).toHaveProperty('months');
    expect(validateCatalogDraft('warranty-periods', { ...base, months: '60' })).toEqual({});
    expect(validateCatalogDraft('taxes', { ...base, ratePercent: '101' })).toHaveProperty('ratePercent');
    expect(validateCatalogDraft('products', { ...base, sku: 'bad sku' })).toHaveProperty('sku');
    expect(validateCatalogDraft('products', { ...base, sku: 'SKU-1', price: 'abc' })).toHaveProperty('unitPriceMinor');
  });

  it('builds product payloads without sortOrder/code and clears fields on edit', () => {
    const d = { ...emptyCatalogDraft(), name: ' Panel ', sku: 'P-1', price: '1500.5' };
    expect(catalogPayload('products', d, false)).toEqual({ name: 'Panel', isActive: true, sku: 'P-1', unitPriceMinor: 150050 });
    expect(catalogPayload('products', { ...d, price: '' }, true)).toMatchObject({
      categoryId: null,
      warrantyPeriodId: null,
      description: null,
      unitPriceMinor: null,
    });
  });

  it('builds lead status payloads without isActive and with basis points', () => {
    const d = { ...emptyCatalogDraft(), name: 'Hot', code: 'hot', winPercent: '72.5' };
    const body = catalogPayload('lead-statuses', d, false);
    expect(body).not.toHaveProperty('isActive');
    expect(body).toMatchObject({ code: 'hot', sortOrder: 0, isOpen: true, winProbabilityBps: 7250 });
  });

  it('round-trips an existing item into a draft', () => {
    const d = draftFromItem(item({ name: 'GST', code: 'gst', rateBps: 1800, sortOrder: 3 }));
    expect(d).toMatchObject({ name: 'GST', code: 'gst', ratePercent: '18', sortOrder: '3', codeTouched: true });
  });

  it('describes rows like the mobile subtitle', () => {
    expect(catalogSubtitle('taxes', item({ code: 'gst', rateBps: 1850 }))).toBe('gst · 18.50%');
    expect(catalogSubtitle('products', item({ sku: 'P-1', categoryName: 'Solar', warrantyPeriodName: '5 years' }))).toBe(
      'P-1 · Solar · 5 years warranty',
    );
  });
});

describe('buildTaxBatch', () => {
  const original = [item({ id: 'a', name: 'GST' }), item({ id: 'b', name: 'CESS' })];

  it('skips unnamed rows, numbers sortOrder and deletes removed originals', () => {
    const r = buildTaxBatch(
      [
        { key: 'a', id: 'a', name: 'GST', rate: '18', active: true },
        { key: 'n1', name: ' ', rate: '5', active: true },
        { key: 'n2', name: 'IGST', rate: '', active: false },
      ],
      original,
    );
    expect(r).toEqual({
      ok: true,
      items: [
        { id: 'a', name: 'GST', ratePercent: 18, isActive: true, sortOrder: 10 },
        { name: 'IGST', ratePercent: 0, isActive: false, sortOrder: 20 },
      ],
      deleteIds: ['b'],
    });
  });

  it('rejects bad rates and empty batches', () => {
    expect(buildTaxBatch([{ key: 'x', name: 'GST', rate: '120', active: true }], [])).toMatchObject({ ok: false });
    expect(buildTaxBatch([{ key: 'x', name: '', rate: '1', active: true }], [])).toMatchObject({ ok: false });
  });
});

describe('rbac helpers', () => {
  it('groups permissions by resource, sorted', () => {
    const perms: Permission[] = [
      { id: '1', code: 'lead:read', resource: 'lead', action: 'read', description: null },
      { id: '2', code: 'attendance:punch', resource: 'attendance', action: 'punch', description: null },
      { id: '3', code: 'lead:create', resource: 'lead', action: 'create', description: null },
    ];
    const groups = groupPermissions(perms);
    expect(groups.map((g) => g.resource)).toEqual(['attendance', 'lead']);
    expect(groups[1]!.items.map((p) => p.code)).toEqual(['lead:create', 'lead:read']);
  });

  it('compares sets', () => {
    expect(sameMembers(new Set(['a', 'b']), ['b', 'a'])).toBe(true);
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false);
  });

  it('validates role codes like the API', () => {
    expect(validateRole({ name: 'Field tech', code: 'field.tech_2' })).toEqual({});
    expect(validateRole({ name: 'X', code: '2bad' })).toEqual({
      name: 'Name is required.',
      code: 'Use lowercase letters, numbers, dots, or underscores.',
    });
  });

  it('validates teams like CreateTeamRequest', () => {
    expect(validateTeam('North', 'north')).toEqual({});
    expect(validateTeam('N', 'n')).toEqual({ name: 'Name is required.', code: 'Code is required.' });
    expect(validateTeam('North')).toEqual({});
  });
});

describe('staff helpers', () => {
  const member: StaffMember = {
    id: 'm1',
    status: 'active',
    active: true,
    designation: null,
    employeeCode: 'E-7',
    user: { id: 'u1', fullName: 'Asha Rao', email: 'asha@example.com', lastLoginAt: null },
    roles: [{ id: 'r1', code: 'sales', name: 'Sales' }],
    teams: [],
  };

  it('requires a role and a valid email', () => {
    expect(validateStaffDraft({ ...emptyStaffDraft(), fullName: 'Asha', email: 'nope' })).toEqual({
      email: 'Enter a valid email.',
      roleIds: 'Select at least one role.',
    });
  });

  it('omits blank optional fields on create but sends them on edit', () => {
    const d = { ...staffDraftFromMember(member), email: ' Asha@Example.com ' };
    expect(staffPayload(d)).toEqual({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      employeeCode: 'E-7',
      roleIds: ['r1'],
      teamIds: [],
    });
    expect(staffPayload(d, true)).toHaveProperty('designation', '');
  });

  it('labels status', () => {
    expect(staffStatusLabel(member)).toBe('active');
    expect(staffStatusLabel({ active: false, status: 'invited' })).toBe('invited');
    expect(staffStatusLabel({ active: false, status: 'suspended' })).toBe('inactive');
  });
});

describe('sortSessions', () => {
  it('puts the current device first, then most recent', () => {
    const rows = [
      { id: 'a', isCurrent: false, lastSeenAt: '2026-01-01T00:00:00Z' },
      { id: 'b', isCurrent: false, lastSeenAt: '2026-03-01T00:00:00Z' },
      { id: 'c', isCurrent: true, lastSeenAt: '2025-01-01T00:00:00Z' },
    ];
    expect(sortSessions(rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});
