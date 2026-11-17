/// Mirrors apps/api/src/modules/quotations/domain/quotation-totals.ts so the
/// form preview matches what the server stores.
class QuotationTotals {
  const QuotationTotals({
    required this.itemsMinor,
    required this.chargeMinor,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.taxMinor,
    required this.totalMinor,
  });

  final int itemsMinor;
  final List<int> chargeMinor;
  final int subtotalMinor;
  final int discountMinor;
  final int taxMinor;
  final int totalMinor;
}

/// Splits [total] over [weights]; the shares always add back up to [total].
List<int> allocateProportionally(int total, List<int> weights) {
  final sum = weights.fold<int>(0, (a, b) => a + b);
  if (total <= 0 || sum <= 0) {
    return [for (final _ in weights) 0];
  }
  final raw = [for (final w in weights) total * w / sum];
  final shares = [for (final r in raw) r.floor()];
  var left = total - shares.fold<int>(0, (a, b) => a + b);
  final order = List<int>.generate(raw.length, (i) => i)
    ..sort((a, b) => (raw[b] - raw[b].floor()).compareTo(raw[a] - raw[a].floor()));
  for (final index in order) {
    if (left <= 0) {
      break;
    }
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}

/// Vendor-priced unit prices round up to a multiple of [stepMinor] (0/1 = off).
int roundUpTo(int amountMinor, int stepMinor) =>
    stepMinor > 1 ? ((amountMinor + stepMinor - 1) ~/ stepMinor) * stepMinor : amountMinor;

/// Selling unit price from a purchase price and margin (basis points).
int unitPriceFromPurchase(int purchaseMinor, int marginBps, int stepMinor) =>
    roundUpTo(purchaseMinor + (purchaseMinor * marginBps / 10000).round(), stepMinor);

QuotationTotals computeQuotationTotals({
  required List<({int quantity, int unitPriceMinor})> items,
  required List<int> charges,
  required int taxBps,
  required int discountMinor,
  required bool gstInclusive,
}) {
  final bases = [
    for (final i in items) (i.quantity < 1 ? 1 : i.quantity) * (i.unitPriceMinor < 0 ? 0 : i.unitPriceMinor),
    for (final c in charges) c < 0 ? 0 : c,
  ];
  final bps = taxBps.clamp(0, 10000);
  final subtotal = bases.fold<int>(0, (a, b) => a + b);
  final discount = discountMinor.clamp(0, subtotal);
  final shares = allocateProportionally(discount, bases);
  var tax = 0;
  var total = 0;
  for (var i = 0; i < bases.length; i++) {
    final net = bases[i] - shares[i];
    if (gstInclusive) {
      final taxable = (net * 10000 / (10000 + bps)).round();
      tax += net - taxable;
      total += net;
    } else {
      final t = (net * bps / 10000).round();
      tax += t;
      total += net + t;
    }
  }
  final itemsMinor = bases.take(items.length).fold<int>(0, (a, b) => a + b);
  return QuotationTotals(
    itemsMinor: itemsMinor,
    chargeMinor: bases.skip(items.length).toList(),
    subtotalMinor: subtotal,
    discountMinor: discount,
    taxMinor: tax,
    totalMinor: total,
  );
}
