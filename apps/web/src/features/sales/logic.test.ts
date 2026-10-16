import { describe, expect, it } from 'vitest';
import {
  addMonthsYmd,
  computeTotals,
  impliedWarrantyEnd,
  lineAmounts,
  lineTaxBps,
  newQuotationLine,
  parseRupees,
  parseWarrantyToken,
  predictionLabel,
  quotationListQuery,
  statusActionLabel,
  statusActions,
  validateQuotationLines,
  validateWarrantyLines,
  newWarrantyLine,
  warrantyLinesFromQuotation,
  warrantyPeriodLabel,
  formatDay,
} from './logic';
import type { QuotationItem, QuotationTax } from './types';

const gst18: QuotationTax = { id: 't18', name: 'GST 18%', code: 'gst_18', rateBps: 1800, ratePercent: 18 };
const cess: QuotationTax = { id: 'tc', name: 'Cess', code: 'cess', rateBps: 100, ratePercent: 1 };

describe('money + totals', () => {
  it('parses rupees to paise', () => {
    expect(parseRupees('1,250.5')).toBe(125050);
    expect(parseRupees('')).toBe(0);
    expect(parseRupees('abc')).toBeNull();
  });

  it('caps discount at the extended amount and taxes the remainder', () => {
    expect(lineAmounts({ quantity: 2, unitPriceMinor: 10000, discountMinor: 50000, taxBps: 1800 })).toEqual({
      extendedMinor: 20000,
      discountMinor: 20000,
      taxableMinor: 0,
      taxMinor: 0,
      lineTotalMinor: 0,
    });
    const t = computeTotals([
      { quantity: 2, unitPriceMinor: 10000, discountMinor: 1000, taxBps: 1800 },
      { quantity: 1, unitPriceMinor: 5000, discountMinor: 0, taxBps: 0 },
    ]);
    expect(t.subtotalMinor).toBe(25000);
    expect(t.discountMinor).toBe(1000);
    expect(t.taxMinor).toBe(3420);
    expect(t.totalMinor).toBe(27420);
  });

  it('sums managed taxes, falling back to the free-text percentage', () => {
    expect(lineTaxBps({ taxRateIds: ['t18', 'tc'], taxPct: '0' }, [gst18, cess])).toBe(1900);
    expect(lineTaxBps({ taxRateIds: [], taxPct: '12.5' }, [])).toBe(1250);
  });
});

describe('quotation lines', () => {
  it('defaults new lines to GST 18 when taxes are managed', () => {
    expect(newQuotationLine([cess, gst18]).taxRateIds).toEqual(['t18']);
    expect(newQuotationLine([]).taxRateIds).toEqual([]);
  });

  it('skips blank lines and flags invalid ones', () => {
    const blank = newQuotationLine([]);
    const bad = { ...newQuotationLine([]), description: 'x', quantity: '0', unitPrice: '-1' };
    const good = { ...newQuotationLine([gst18]), description: 'Panel', unitPrice: '100' };
    expect(validateQuotationLines([blank], []).message).toBe('Add at least one line item.');
    const res = validateQuotationLines([blank, bad, good], [gst18]);
    expect(Object.keys(res.errors)).toEqual([bad.key]);
    expect(res.message).toBe('Fix the highlighted line items.');
    const ok = validateQuotationLines([good], [gst18]);
    expect(ok.message).toBeNull();
    expect(ok.items).toEqual([{ description: 'Panel', quantity: 1, unitPriceMinor: 10000, discountMinor: 0, taxRateIds: ['t18'] }]);
  });
});

describe('quotation list + status', () => {
  it('bucket beats pending beats status', () => {
    expect(quotationListQuery({ status: 'sent', pending: true, bucket: 'overdue' })).toEqual({
      leadId: undefined,
      bucket: 'overdue',
      pending: undefined,
      status: undefined,
    });
    expect(quotationListQuery({ status: 'sent', pending: true })).toMatchObject({ pending: true, status: undefined });
    expect(quotationListQuery({ status: 'sent' })).toMatchObject({ status: 'sent' });
  });

  it('hides send from status actions and labels won/lost', () => {
    expect(statusActions({ nextStatuses: ['sent', 'won', 'lost'] })).toEqual(['won', 'lost']);
    expect(statusActionLabel('won', {})).toBe('Mark won');
    expect(statusActionLabel('negotiation', { negotiation: 'Negotiation' })).toBe('Move to Negotiation');
  });

  it('formats the closing prediction like mobile', () => {
    expect(predictionLabel({ closingPrediction: null })).toBe('—');
    expect(predictionLabel({ closingPrediction: { probabilityBps: 6500, band: 'medium', expectedCloseOn: null, reasons: [] } })).toBe(
      '65% · Medium',
    );
  });
});

describe('warranties', () => {
  it('adds months clamped to month end', () => {
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsYmd('2026-03-15', 24)).toBe('2028-03-15');
  });

  it('derives the end date from the longest product term', () => {
    expect(impliedWarrantyEnd('2026-01-10', [12, null, 24])).toBe('2028-01-10');
    expect(impliedWarrantyEnd('2026-01-10', [null])).toBeNull();
    expect(impliedWarrantyEnd('', [12])).toBeNull();
  });

  it('labels the period in years or months', () => {
    expect(warrantyPeriodLabel('2026-01-01', '2028-01-01')).toBe('2 Years');
    expect(warrantyPeriodLabel('2026-01-01', '2027-07-01')).toBe('18 Months');
  });

  it('validates covered items', () => {
    expect(validateWarrantyLines([newWarrantyLine()]).message).toBe('Add at least one covered item.');
    const line = { ...newWarrantyLine(), description: 'Inverter', serialNumber: ' SN1 ' };
    expect(validateWarrantyLines([line]).items).toEqual([{ description: 'Inverter', quantity: 1, serialNumber: 'SN1' }]);
  });

  it('prefills covered items from quotation lines', () => {
    const item: QuotationItem = {
      id: 'i1', productId: 'p1', productName: 'Panel', description: 'Solar panel', quantity: 3,
      unitPriceMinor: 100, discountMinor: 0, taxBps: 0, taxRateIds: [], lineTotalMinor: 300, sortOrder: 0,
    };
    expect(warrantyLinesFromQuotation([item])).toMatchObject([{ productId: 'p1', description: 'Solar panel', quantity: '3', serialNumber: '' }]);
  });

  it('parses verification URLs and tokens', () => {
    const hex = 'a'.repeat(48);
    expect(parseWarrantyToken(`https://api.example.com/api/v1/public/warranty/${hex.toUpperCase()}/view`)).toBe(hex);
    expect(parseWarrantyToken(`https://console.example.com/verify-warranty/demo-token`)).toBe('demo-token');
    expect(parseWarrantyToken('  ')).toBeNull();
    expect(parseWarrantyToken('not a token!')).toBeNull();
  });

  it('formats calendar dates without a timezone shift', () => {
    expect(formatDay('2026-01-05')).toContain('2026');
    expect(formatDay('2026-01-05')).toContain('5');
    expect(formatDay(null)).toBe('—');
  });
});
