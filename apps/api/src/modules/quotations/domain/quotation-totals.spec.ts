import { computeQuotationTotals, profitAfterDiscount, resolveUnitPrice } from './quotation-totals';

describe('resolveUnitPrice', () => {
  it('rounds purchase price + margin up to the next step', () => {
    const r = resolveUnitPrice({ vendorPriceMinor: 915_300, marginType: 'percent', marginValue: 1000, roundStepMinor: 10_000 });
    expect(r.unitPriceMinor).toBe(1_010_000);
  });
  it('does not round when the step is 0', () => {
    const r = resolveUnitPrice({ vendorPriceMinor: 915_300, marginType: 'percent', marginValue: 1000, roundStepMinor: 0 });
    expect(r.unitPriceMinor).toBe(1_006_830);
  });
  it('applies a fixed margin', () => {
    const r = resolveUnitPrice({ vendorPriceMinor: 1_000_000, marginType: 'fixed', marginValue: 150_000 });
    expect(r.unitPriceMinor).toBe(1_150_000);
  });
  it('keeps a typed price as is', () => {
    expect(resolveUnitPrice({ unitPriceMinor: 5000, roundStepMinor: 10_000 }).unitPriceMinor).toBe(5000);
  });
});

describe('computeQuotationTotals', () => {
  it('adds GST on top when exclusive', () => {
    const t = computeQuotationTotals([{ quantity: 1, unitPriceMinor: 1_200_000, taxBps: 1800 }]);
    expect(t.taxMinor).toBe(216_000);
    expect(t.totalMinor).toBe(1_416_000);
  });
  it('splits GST out of the price when inclusive', () => {
    const t = computeQuotationTotals([{ quantity: 1, unitPriceMinor: 1_416_000, taxBps: 1800 }], { gstInclusive: true });
    expect(t.totalMinor).toBe(1_416_000);
    expect(t.taxMinor).toBe(216_000);
  });
  it('matches the sample quotation: 14,900 less 250 discount = 14,650', () => {
    const t = computeQuotationTotals(
      [
        { quantity: 1, unitPriceMinor: 690_000, taxBps: 1800 },
        { quantity: 1, unitPriceMinor: 800_000, taxBps: 1800 },
      ],
      { discountMinor: 25_000, gstInclusive: true },
    );
    expect(t.subtotalMinor).toBe(1_490_000);
    expect(t.totalMinor).toBe(1_465_000);
  });
  it('shares the total discount across items and charges before GST', () => {
    const t = computeQuotationTotals([{ quantity: 2, unitPriceMinor: 50_000, taxBps: 1800 }], {
      charges: [{ description: 'Installation', amountMinor: 20_000, taxBps: 1800 }],
      discountMinor: 12_000,
    });
    expect(t.subtotalMinor).toBe(120_000);
    expect(t.lines[0]!.discountMinor + t.charges[0]!.discountMinor).toBe(12_000);
    expect(t.totalMinor).toBe(108_000 + Math.round((108_000 * 1800) / 10000));
  });
  it('never discounts below zero', () => {
    const t = computeQuotationTotals([{ quantity: 1, unitPriceMinor: 1000, taxBps: 0 }], { discountMinor: 9999 });
    expect(t.totalMinor).toBe(0);
  });
});

describe('profitAfterDiscount', () => {
  it('is margin on vendor-priced lines less the discount', () => {
    expect(
      profitAfterDiscount(
        [
          { quantity: 3, unitPriceMinor: 1_010_000, vendorPriceMinor: 915_300 },
          { quantity: 1, unitPriceMinor: 50_000, vendorPriceMinor: null },
        ],
        10_000,
      ),
    ).toBe(3 * (1_010_000 - 915_300) - 10_000);
  });
});
