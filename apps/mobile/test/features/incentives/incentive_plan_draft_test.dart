import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/incentives/domain/incentive.dart';
import 'package:intra_leads/features/incentives/domain/incentive_plan_draft.dart';

BandDraft band(
  int key,
  int from,
  int? to, {
  String kind = PayoutKinds.percent,
  int? rate = 200,
  int? amount,
  int? perUnit,
  String? serverId,
  bool dirty = false,
}) {
  return BandDraft(
    key: key,
    fromBps: from,
    toBps: to,
    payoutKind: kind,
    rateBps: rate,
    amountPaise: amount,
    perUnitPaise: perUnit,
    serverId: serverId,
    dirty: dirty,
  );
}

void main() {
  group('unit conversion', () {
    test('percent text becomes basis points', () {
      expect(percentToBps('80'), 8000);
      expect(percentToBps('12.5'), 1250);
      expect(percentToBps(' 0 '), 0);
      expect(percentToBps(''), isNull);
      expect(percentToBps('-1'), isNull);
    });

    test('rupees become paise, commas allowed', () {
      expect(rupeesToPaise('5000'), 500000);
      expect(rupeesToPaise('50,000'), 5000000);
      expect(rupeesToPaise('12.50'), 1250);
      expect(rupeesToPaise('abc'), isNull);
    });

    test('server values round-trip back into field text', () {
      expect(bpsToPercentText(8000), '80');
      expect(bpsToPercentText(1250), '12.5');
      expect(bpsToPercentText(null), '');
      expect(paiseToRupeesText(500000), '5000');
      expect(paiseToRupeesText(1250), '12.50');
    });

    test('basis follows the metric', () {
      expect(basisForMetric('revenue', isMoney: true), 'revenue');
      expect(basisForMetric('units_sold', isMoney: false), 'units');
      expect(basisForMetric('quotations_accepted', isMoney: false), 'count');
    });

    test('percent is only offered on money metrics', () {
      expect(payoutKindsFor(isMoney: true), contains(PayoutKinds.percent));
      expect(payoutKindsFor(isMoney: false), isNot(contains(PayoutKinds.percent)));
    });
  });

  group('band checks', () {
    test('a band needs its matching amount', () {
      expect(bandError(band(0, 8000, 10000)), isNull);
      expect(bandError(band(0, 8000, 10000, rate: null)), isNotNull);
      expect(bandError(band(0, 8000, 10000, kind: PayoutKinds.flat, rate: null)), isNotNull);
      expect(
        bandError(band(0, 8000, 10000, kind: PayoutKinds.flat, rate: null, amount: 300000)),
        isNull,
      );
    });

    test('upper bound must be above the lower bound', () {
      expect(bandError(band(0, 10000, 10000)), isNotNull);
      expect(bandError(band(0, 10000, 8000)), isNotNull);
    });

    test('touching bands do not overlap; crossing ones do', () {
      final bands = [band(0, 8000, 10000), band(1, 10000, null)];
      expect(overlappingBand(bands, band(2, 12000, null)), isNotNull);
      expect(overlappingBand(bands, band(2, 9000, 11000)), isNotNull);
      expect(overlappingBand([band(0, 8000, 10000)], band(1, 10000, null)), isNull);
    });

    test('editing a band does not collide with its own old range', () {
      final bands = [band(0, 8000, 10000), band(1, 10000, null)];
      expect(overlappingBand(bands, band(0, 7000, 10000)), isNull);
    });
  });

  group('coverage warnings', () {
    test('a clean ladder has none', () {
      final bands = [band(0, 8000, 10000), band(1, 10000, 12000), band(2, 12000, null)];
      expect(coverageWarnings(bands, minAttainmentBps: 8000), isEmpty);
    });

    test('flags no bands, a late start, gaps and a closed top', () {
      expect(coverageWarnings(const [], minAttainmentBps: 0), hasLength(1));
      final warnings = coverageWarnings(
        [band(0, 9000, 10000), band(1, 11000, 13000)],
        minAttainmentBps: 8000,
      );
      expect(warnings, hasLength(3));
      expect(warnings.join(' '), contains('80%'));
      expect(warnings.join(' '), contains('100% and 110%'));
      expect(warnings.join(' '), contains('above 130%'));
    });
  });

  group('save plan', () {
    test('removes, then updates, then creates', () {
      final bands = [
        band(0, 8000, 10000, serverId: 'kept'),
        band(1, 10000, 12000, serverId: 'edited', dirty: true),
        band(2, 12000, null),
      ];
      final changes = bandChanges(bands: bands, savedIds: ['kept', 'edited', 'gone']);
      expect(changes.remove, ['gone']);
      expect(changes.update.map((b) => b.serverId), ['edited']);
      expect(changes.create.map((b) => b.key), [2]);
    });

    test('nothing to do when nothing changed', () {
      final changes = bandChanges(bands: [band(0, 8000, null, serverId: 'a')], savedIds: ['a']);
      expect(changes.isEmpty, isTrue);
    });
  });

  test('request body carries only the amount the kind uses, in API units', () {
    final json = band(
      0,
      10000,
      null,
      kind: PayoutKinds.percent,
      rate: 300,
      amount: 999,
    ).toJson();
    expect(json, {'fromBps': 10000, 'payoutKind': 'percent', 'rateBps': 300, 'bonusAmount': 0});
  });

  test('a server slab loads into an editable band', () {
    const slab = IncentiveSlab(
      id: 's1',
      fromBps: 10000,
      payoutKind: 'flat',
      amount: 300000,
      bonusAmount: 50000,
    );
    final draft = BandDraft.fromSlab(slab, 4);
    expect(draft.serverId, 's1');
    expect(draft.amountPaise, 300000);
    expect(draft.bonusPaise, 50000);
    expect(draft.bandLabel, '100%+');
    expect(draft.dirty, isFalse);
  });
}
