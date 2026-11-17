import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/quotations/domain/quotation_totals.dart';

void main() {
  test('rounds purchase price + margin up to the next step', () {
    expect(unitPriceFromPurchase(915300, 1000, 10000), 1010000);
    expect(unitPriceFromPurchase(915300, 1000, 0), 1006830);
  });

  test('matches the sample: 14,900 less 250 = 14,650 (inclusive)', () {
    final t = computeQuotationTotals(
      items: [(quantity: 1, unitPriceMinor: 690000), (quantity: 1, unitPriceMinor: 800000)],
      charges: const [],
      taxBps: 1800,
      discountMinor: 25000,
      gstInclusive: true,
    );
    expect(t.subtotalMinor, 1490000);
    expect(t.totalMinor, 1465000);
  });

  test('adds GST on top when exclusive', () {
    final t = computeQuotationTotals(
      items: [(quantity: 1, unitPriceMinor: 1200000)],
      charges: const [],
      taxBps: 1800,
      discountMinor: 0,
      gstInclusive: false,
    );
    expect(t.taxMinor, 216000);
    expect(t.totalMinor, 1416000);
  });

  test('discount is shared across items and charges and never goes below zero', () {
    final t = computeQuotationTotals(
      items: [(quantity: 2, unitPriceMinor: 50000)],
      charges: [20000],
      taxBps: 1800,
      discountMinor: 999999,
      gstInclusive: false,
    );
    expect(t.discountMinor, 120000);
    expect(t.totalMinor, 0);
  });
}
