import {
  SEARCH_CATALOG,
  SEARCH_FIELD,
  classifySearchField,
  isSearchField,
  normalizeDocumentNumber,
  phoneVariants,
  planSearch,
  scoreHit,
} from './search-query';

describe('search catalog', () => {
  it('covers the four search fields', () => {
    expect(SEARCH_CATALOG.map((entry) => entry.code)).toEqual([
      SEARCH_FIELD.customer,
      SEARCH_FIELD.mobile,
      SEARCH_FIELD.leadId,
      SEARCH_FIELD.quotationNumber,
    ]);
    expect(isSearchField('lead_id')).toBe(true);
    expect(isSearchField('email')).toBe(false);
  });
});

describe('classifySearchField', () => {
  it('routes UUID and lead numbers to lead id', () => {
    expect(classifySearchField('0192a1b2-3456-7890-abcd-ef0123456789')).toBe('lead_id');
    expect(classifySearchField('LD-2026-000123')).toBe('lead_id');
    expect(classifySearchField('ld2026000123')).toBe('lead_id');
    expect(classifySearchField('000123')).toBe('lead_id');
  });

  it('routes quotation numbers and mobile digits', () => {
    expect(classifySearchField('QT-2026-000045')).toBe('quotation_number');
    expect(classifySearchField('qt 2026')).toBe('quotation_number');
    expect(classifySearchField('9876543210')).toBe('mobile');
    expect(classifySearchField('+91 98765 43210')).toBe('mobile');
  });

  it('routes free text to customer', () => {
    expect(classifySearchField('Ramesh')).toBe('customer');
    expect(classifySearchField('Sharma Traders')).toBe('customer');
  });
});

describe('normalizeDocumentNumber', () => {
  it('rebuilds compact lead and quotation numbers', () => {
    expect(normalizeDocumentNumber('ld2026000123')).toBe('LD-2026-000123');
    expect(normalizeDocumentNumber('QT 2026 45')).toBe('QT-2026-000045');
    expect(normalizeDocumentNumber('LD-2026')).toBe('LD-2026');
  });
});

describe('planSearch', () => {
  it('uses btree-friendly exact/prefix plans for document ids', () => {
    const exact = planSearch('LD-2026-000123');
    expect(exact).toMatchObject({
      ok: true,
      plan: { field: 'lead_id', strategy: 'exact', normalized: 'LD-2026-000123' },
    });
    const prefix = planSearch('LD-2026');
    expect(prefix).toMatchObject({
      ok: true,
      plan: { field: 'lead_id', strategy: 'prefix', normalized: 'LD-2026' },
    });
    const quote = planSearch('qt2026000001', 'quotation_number');
    expect(quote).toMatchObject({
      ok: true,
      plan: { field: 'quotation_number', strategy: 'exact', normalized: 'QT-2026-000001' },
    });
  });

  it('builds E.164 phone variants for btree lookup', () => {
    const planned = planSearch('9876543210');
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    expect(planned.plan.field).toBe('mobile');
    expect(planned.plan.strategy).toBe('phone_exact');
    expect(phoneVariants('9876543210')).toContain('+919876543210');
  });

  it('rejects queries that are too short for the field', () => {
    expect(planSearch('R')).toEqual({ ok: false, reason: 'too_short', field: 'customer' });
    expect(planSearch('12', 'mobile')).toEqual({
      ok: false,
      reason: 'too_short',
      field: 'mobile',
    });
  });

  it('honors an explicit field even when auto-class would differ', () => {
    const planned = planSearch('Ramesh', 'customer');
    expect(planned).toMatchObject({
      ok: true,
      plan: { field: 'customer', strategy: 'contains' },
    });
  });
});

describe('scoreHit', () => {
  it('ranks exact above prefix and contains', () => {
    expect(
      scoreHit({ strategy: 'exact', matchedValue: 'LD-2026-000123', normalized: 'LD-2026-000123' }),
    ).toBe(100);
    expect(
      scoreHit({ strategy: 'prefix', matchedValue: 'LD-2026-000123', normalized: 'LD-2026' }),
    ).toBe(85);
    expect(
      scoreHit({ strategy: 'contains', matchedValue: 'Ramesh Kumar', normalized: 'kumar' }),
    ).toBe(60);
  });
});
