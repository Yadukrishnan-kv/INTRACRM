import { describe, expect, it } from 'vitest';
import {
  addMonthsYmd,
  computeTotals,
  impliedWarrantyEnd,
  draftUnitPriceMinor,
  draftProfitMinor,
  presetCharges,
  validateCharges,
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
import type { QuotationItem } from './types';

describe('money + totals', () => {
  it('parses rupees to paise', () => {
    expect(parseRupees('1,250.5')).toBe(125050);
    expect(parseRupees('')).toBe(0);
    expect(parseRupees('abc')).toBeNull();
  });

  it('applies the total discount before GST, shared across lines and charges', () => {
    const t = computeTotals(
      [
        { quantity: 2, unitPriceMinor: 10000, taxBps: 1800 },
        { quantity: 1, unitPriceMinor: 5000, taxBps: 0 },
      ],
      { charges: [{ amountMinor: 5000, taxBps: 1800 }], discountMinor: 3000 },
    );
    expect(t.subtotalMinor).toBe(30000);
    expect(t.discountMinor).toBe(3000);
    expect(t.lines[0]!.discountMinor + t.lines[1]!.discountMinor + t.charges[0]!.discountMinor).toBe(3000);
    expect(t.totalMinor).toBe(30000 - 3000 + t.taxMinor);
    expect(computeTotals([{ quantity: 1, unitPriceMinor: 1000, taxBps: 0 }], { discountMinor: 9999 }).totalMinor).toBe(0);
  });

  it('splits GST out of inclusive prices instead of adding it', () => {
    const t = computeTotals([{ quantity: 1, unitPriceMinor: 1416000, taxBps: 1800 }], { gstInclusive: true });
    expect(t.totalMinor).toBe(1416000);
    expect(t.taxMinor).toBe(216000);
  });

  it('matches the sample: 14,900 less 250 = 14,650', () => {
    const t = computeTotals(
      [
        { quantity: 1, unitPriceMinor: 690000, taxBps: 1800 },
        { quantity: 1, unitPriceMinor: 800000, taxBps: 1800 },
      ],
      { discountMinor: 25000, gstInclusive: true },
    );
    expect(t.totalMinor).toBe(1465000);
  });
});

describe('quotation lines', () => {
  it('rounds purchase price + margin up to the next step', () => {
    const line = { ...newQuotationLine(), purchasePrice: '9153', marginPct: '10' };
    expect(draftUnitPriceMinor(line, 10000)).toBe(1010000);
    expect(draftUnitPriceMinor(line, 0)).toBe(1006830);
  });

  it('uses the typed unit price when there is no purchase price', () => {
    expect(draftUnitPriceMinor({ ...newQuotationLine(), unitPrice: '1250.5' }, 10000)).toBe(125050);
  });

  it('computes profit after discount', () => {
    const line = { ...newQuotationLine(), quantity: '3', purchasePrice: '9153', marginPct: '10' };
    expect(draftProfitMinor([line], 10000, 10000)).toBe(3 * (1010000 - 915300) - 10000);
  });

  it('skips blank lines and flags invalid ones', () => {
    const blank = newQuotationLine();
    const bad = { ...newQuotationLine(), description: 'x', quantity: '0', unitPrice: '-1' };
    const good = { ...newQuotationLine(), itemCode: 'KW2', description: 'Panel', width: '113', height: '85', unitPrice: '6900' };
    expect(validateQuotationLines([blank], 1800).message).toBe('Add at least one line item.');
    const res = validateQuotationLines([blank, bad, good], 1800);
    expect(Object.keys(res.errors)).toEqual([bad.key]);
    expect(res.message).toBe('Fix the highlighted line items.');
    const ok = validateQuotationLines([good], 1800);
    expect(ok.message).toBeNull();
    expect(ok.items).toEqual([
      { itemCode: 'KW2', description: 'Panel', quantity: 1, width: 113, height: 85, unit: 'Nos', taxBps: 1800, unitPriceMinor: 690000 },
    ]);
  });

  it('sends purchase price and margin for purchase-priced lines', () => {
    const line = { ...newQuotationLine(), description: 'Frame', purchasePrice: '10000', marginPct: '20' };
    expect(validateQuotationLines([line], 1800).items).toEqual([
      { description: 'Frame', quantity: 1, unit: 'Nos', taxBps: 1800, vendorPriceMinor: 1000000, marginType: 'percent', marginValue: 2000 },
    ]);
  });

  it('only sends charges that have an amount', () => {
    const [transport, install] = presetCharges();
    expect(validateCharges([{ ...transport!, amount: '2500' }, install!], 1800).charges).toEqual([
      { description: 'Transportation Charge', amountMinor: 250000, taxBps: 1800 },
    ]);
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
      unitPriceMinor: 100, discountMinor: 0, taxBps: 0, taxRateIds: [], itemCode: null, width: null, height: null,
      unit: 'Nos', vendorPriceMinor: null, marginType: null, marginValue: 0, lineTotalMinor: 300, sortOrder: 0,
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
