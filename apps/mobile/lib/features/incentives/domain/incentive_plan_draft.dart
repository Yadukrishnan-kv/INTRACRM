/// The plan editor's working copy: what the form holds before it is saved,
/// in the units people type (₹ and %), plus the checks and the request bodies
/// the API expects (paise and basis points).
library;

import 'incentive.dart';

/// Payout kinds as the API names them.
class PayoutKinds {
  static const percent = 'percent';
  static const flat = 'flat';
  static const perUnit = 'per_unit';

  static String title(String kind) {
    return switch (kind) {
      percent => '% of sales',
      flat => 'Flat amount',
      perUnit => 'Per unit',
      _ => kind,
    };
  }
}

/// `12.5` (%) → `1250` (bps). Null for blank or invalid input.
int? percentToBps(String raw) {
  final value = double.tryParse(raw.trim());
  if (value == null || value < 0) {
    return null;
  }
  return (value * 100).round();
}

/// `5000` (₹) → `500000` (paise). Null for blank or invalid input.
int? rupeesToPaise(String raw) {
  final value = double.tryParse(raw.trim().replaceAll(',', ''));
  if (value == null || value < 0) {
    return null;
  }
  return (value * 100).round();
}

/// `1250` → `12.5`, `8000` → `80`: the text a field starts with.
String bpsToPercentText(int? bps) {
  if (bps == null) {
    return '';
  }
  final value = bps / 100;
  return value == value.roundToDouble() ? value.toStringAsFixed(0) : '$value';
}

/// `500000` → `5000`: paise back to the rupees a field shows.
String paiseToRupeesText(num? paise) {
  if (paise == null) {
    return '';
  }
  final value = paise / 100;
  return value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
}

/// The API's `basis` follows from the metric: money pays on revenue, units
/// sold on units, anything else on a plain count.
String basisForMetric(String metricCode, {required bool isMoney}) {
  if (isMoney) {
    return 'revenue';
  }
  return metricCode == 'units_sold' ? 'units' : 'count';
}

/// Percent of a count is meaningless, so money metrics offer percent and flat,
/// and unit/count metrics offer flat and per unit.
List<String> payoutKindsFor({required bool isMoney}) {
  return isMoney
      ? const [PayoutKinds.percent, PayoutKinds.flat]
      : const [PayoutKinds.flat, PayoutKinds.perUnit];
}

/// One attainment band being edited. [serverId] is null until the band has
/// been created on the server, so a retry after a partial save does not
/// create it twice.
class BandDraft {
  const BandDraft({
    required this.key,
    required this.fromBps,
    required this.payoutKind,
    this.serverId,
    this.label,
    this.toBps,
    this.rateBps,
    this.amountPaise,
    this.perUnitPaise,
    this.bonusPaise = 0,
    this.dirty = false,
  });

  /// Stable local identity for list keys and replacement.
  final int key;
  final String? serverId;
  final String? label;
  final int fromBps;

  /// Exclusive upper bound; null for an open top band.
  final int? toBps;
  final String payoutKind;
  final int? rateBps;
  final int? amountPaise;
  final int? perUnitPaise;
  final int bonusPaise;

  /// Changed since it was loaded from the server.
  final bool dirty;

  factory BandDraft.fromSlab(IncentiveSlab slab, int key) {
    return BandDraft(
      key: key,
      serverId: slab.id,
      label: slab.label,
      fromBps: slab.fromBps,
      toBps: slab.toBps,
      payoutKind: slab.payoutKind,
      rateBps: slab.rateBps,
      amountPaise: slab.amount?.round(),
      perUnitPaise: slab.perUnitAmount?.round(),
      bonusPaise: slab.bonusAmount.round(),
    );
  }

  BandDraft copyWith({String? serverId, bool? dirty}) {
    return BandDraft(
      key: key,
      serverId: serverId ?? this.serverId,
      label: label,
      fromBps: fromBps,
      toBps: toBps,
      payoutKind: payoutKind,
      rateBps: rateBps,
      amountPaise: amountPaise,
      perUnitPaise: perUnitPaise,
      bonusPaise: bonusPaise,
      dirty: dirty ?? this.dirty,
    );
  }

  /// `80% – 100%`, or `120%+` for an open top band.
  String get bandLabel {
    final from = '${bpsToPercentText(fromBps)}%';
    return toBps == null ? '$from+' : '$from – ${bpsToPercentText(toBps)}%';
  }

  /// `2% of sales + ₹5,000`, `₹3,000 flat`, `₹50 / unit`.
  String get payoutLabel {
    final base = switch (payoutKind) {
      PayoutKinds.percent => '${bpsToPercentText(rateBps)}% of sales',
      PayoutKinds.flat => '${formatIncentiveMoney(amountPaise ?? 0)} flat',
      PayoutKinds.perUnit => '${formatIncentiveMoney(perUnitPaise ?? 0)} / unit',
      _ => '—',
    };
    return bonusPaise > 0 ? '$base + ${formatIncentiveMoney(bonusPaise)}' : base;
  }

  /// The body for `POST|PATCH /incentives/plans/:id/slabs`.
  Map<String, dynamic> toJson() {
    return {
      if (label != null && label!.trim().isNotEmpty) 'label': label!.trim(),
      'fromBps': fromBps,
      'toBps': ?toBps,
      'payoutKind': payoutKind,
      if (payoutKind == PayoutKinds.percent) 'rateBps': rateBps,
      if (payoutKind == PayoutKinds.flat) 'amount': amountPaise,
      if (payoutKind == PayoutKinds.perUnit) 'perUnitAmount': perUnitPaise,
      'bonusAmount': bonusPaise,
    };
  }
}

/// Why one band cannot be saved as it stands, or null when it can.
String? bandError(BandDraft band) {
  final to = band.toBps;
  if (to != null && to <= band.fromBps) {
    return 'The upper % must be above the lower %.';
  }
  final missing = switch (band.payoutKind) {
    PayoutKinds.percent => band.rateBps == null,
    PayoutKinds.flat => band.amountPaise == null,
    PayoutKinds.perUnit => band.perUnitPaise == null,
    _ => true,
  };
  return missing ? 'Enter the ${PayoutKinds.title(band.payoutKind).toLowerCase()} for this band.' : null;
}

List<BandDraft> sortBands(List<BandDraft> bands) {
  return [...bands]..sort((a, b) => a.fromBps.compareTo(b.fromBps));
}

bool _overlaps(BandDraft a, BandDraft b) {
  final aTo = a.toBps ?? 1 << 40;
  final bTo = b.toBps ?? 1 << 40;
  return a.fromBps < bTo && b.fromBps < aTo;
}

/// The band [candidate] collides with, ignoring the band it replaces.
BandDraft? overlappingBand(List<BandDraft> bands, BandDraft candidate) {
  for (final band in bands) {
    if (band.key != candidate.key && _overlaps(band, candidate)) {
      return band;
    }
  }
  return null;
}

/// Soft problems worth a warning but not a refusal — the same rules the server
/// reports as `coverageIssues`, shown before anything is sent.
List<String> coverageWarnings(List<BandDraft> bands, {required int minAttainmentBps}) {
  if (bands.isEmpty) {
    return const ['Add at least one band, or nothing can be earned.'];
  }
  final sorted = sortBands(bands);
  final warnings = <String>[];
  if (sorted.first.fromBps > minAttainmentBps) {
    warnings.add(
      'Nothing is paid between ${bpsToPercentText(minAttainmentBps)}% and '
      '${bpsToPercentText(sorted.first.fromBps)}% — the first band starts higher than the minimum.',
    );
  }
  for (var i = 0; i < sorted.length - 1; i++) {
    final to = sorted[i].toBps;
    final next = sorted[i + 1].fromBps;
    if (to == null) {
      warnings.add('${sorted[i].bandLabel} has no upper limit but is not the top band.');
    } else if (next > to) {
      warnings.add('Nothing is paid between ${bpsToPercentText(to)}% and ${bpsToPercentText(next)}%.');
    }
  }
  if (sorted.last.toBps != null) {
    warnings.add('Nothing is paid above ${bpsToPercentText(sorted.last.toBps)}% — leave the top band open-ended.');
  }
  return warnings;
}

/// Server calls a save needs, in the order that keeps bands from colliding:
/// removals first, then edits, then new bands.
class BandChanges {
  const BandChanges({required this.remove, required this.update, required this.create});

  final List<String> remove;
  final List<BandDraft> update;
  final List<BandDraft> create;

  bool get isEmpty => remove.isEmpty && update.isEmpty && create.isEmpty;
}

BandChanges bandChanges({required List<BandDraft> bands, required List<String> savedIds}) {
  final kept = {for (final band in bands) ?band.serverId};
  return BandChanges(
    remove: [for (final id in savedIds) if (!kept.contains(id)) id],
    update: [for (final band in sortBands(bands)) if (band.serverId != null && band.dirty) band],
    create: [for (final band in sortBands(bands)) if (band.serverId == null) band],
  );
}
