import {
  attainmentBps,
  basisValue,
  computePayout,
  planCoverageIssues,
  resolveSlab,
  slabPayout,
  sortSlabs,
  summarizeIncentives,
  type Plan,
  type Slab,
} from './incentive-engine';

function slab(partial: Partial<Slab> & Pick<Slab, 'id' | 'fromBps'>): Slab {
  return {
    label: null,
    toBps: null,
    payoutKind: 'percent',
    rateBps: null,
    amount: null,
    perUnitAmount: null,
    bonusAmount: 0,
    ...partial,
  };
}

function plan(partial: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    name: 'Sales incentive',
    basis: 'revenue',
    holdBps: 0,
    minAttainmentBps: 0,
    payoutCap: null,
    ...partial,
  };
}

// 80–100% → 2%, 100–120% → 3% + 5,000 bonus, 120%+ → 4%
const LADDER: Slab[] = [
  slab({ id: 's1', label: '80–100%', fromBps: 8000, toBps: 10000, rateBps: 200 }),
  slab({
    id: 's2',
    label: '100–120%',
    fromBps: 10000,
    toBps: 12000,
    rateBps: 300,
    bonusAmount: 5000,
  }),
  slab({ id: 's3', label: '120%+', fromBps: 12000, toBps: null, rateBps: 400 }),
];

describe('attainmentBps', () => {
  it('reports attainment in basis points', () => {
    expect(attainmentBps(90_000, 150_000)).toBe(6000);
    expect(attainmentBps(150_000, 150_000)).toBe(10000);
    expect(attainmentBps(180_000, 150_000)).toBe(12000);
  });

  it('has no attainment against a zero or negative target', () => {
    expect(attainmentBps(500, 0)).toBeNull();
    expect(attainmentBps(500, -1)).toBeNull();
  });
});

describe('resolveSlab', () => {
  it('treats bands as half-open, so a boundary belongs to the upper slab', () => {
    expect(resolveSlab(LADDER, 9999)?.id).toBe('s1');
    expect(resolveSlab(LADDER, 10000)?.id).toBe('s2');
    expect(resolveSlab(LADDER, 11999)?.id).toBe('s2');
    expect(resolveSlab(LADDER, 12000)?.id).toBe('s3');
  });

  it('matches nothing below the ladder, and the open top band above it', () => {
    expect(resolveSlab(LADDER, 7999)).toBeNull();
    expect(resolveSlab(LADDER, 0)).toBeNull();
    expect(resolveSlab(LADDER, 99_999)?.id).toBe('s3');
  });

  it('matches nothing above a closed top band', () => {
    const closed = [slab({ id: 'only', fromBps: 0, toBps: 10000, rateBps: 100 })];
    expect(resolveSlab(closed, 10000)).toBeNull();
    expect(resolveSlab(closed, 9999)?.id).toBe('only');
  });
});

describe('sortSlabs', () => {
  it('orders by band without mutating the input', () => {
    const shuffled = [LADDER[2], LADDER[0], LADDER[1]];
    expect(sortSlabs(shuffled).map((row) => row.id)).toEqual(['s1', 's2', 's3']);
    expect(shuffled.map((row) => row.id)).toEqual(['s3', 's1', 's2']);
  });
});

describe('planCoverageIssues', () => {
  it('passes a contiguous ladder', () => {
    expect(planCoverageIssues(LADDER)).toEqual([]);
  });

  it('reports a plan with no slabs', () => {
    expect(planCoverageIssues([])).toEqual(['Plan has no slabs, so nothing can be earned.']);
  });

  it('reports a hole between two bands', () => {
    const gapped = [
      slab({ id: 'a', fromBps: 0, toBps: 5000, rateBps: 100 }),
      slab({ id: 'b', fromBps: 8000, toBps: null, rateBps: 200 }),
    ];
    expect(planCoverageIssues(gapped)).toEqual([
      'Attainment 5000–8000 bps is not covered by any slab.',
    ]);
  });

  it('reports an open-ended band that is not last', () => {
    const bad = [
      slab({ id: 'a', fromBps: 0, toBps: null, rateBps: 100 }),
      slab({ id: 'b', fromBps: 8000, toBps: null, rateBps: 200 }),
    ];
    expect(planCoverageIssues(bad)).toEqual([
      'Slab from 0 is open-ended but is not the last slab.',
    ]);
  });
});

describe('slabPayout', () => {
  it('applies a percent rate to the basis', () => {
    expect(slabPayout(slab({ id: 'p', fromBps: 0, rateBps: 250 }), 400_000)).toBe(10_000);
  });

  it('pays a flat amount regardless of the basis', () => {
    const flat = slab({ id: 'f', fromBps: 0, payoutKind: 'flat', amount: 7500 });
    expect(slabPayout(flat, 0)).toBe(7500);
    expect(slabPayout(flat, 9_000_000)).toBe(7500);
  });

  it('multiplies a per-unit rate by the basis', () => {
    const perUnit = slab({ id: 'u', fromBps: 0, payoutKind: 'per_unit', perUnitAmount: 12.5 });
    expect(slabPayout(perUnit, 40)).toBe(500);
  });

  it('treats a missing rate as nothing earned rather than NaN', () => {
    expect(slabPayout(slab({ id: 'x', fromBps: 0, rateBps: null }), 1000)).toBe(0);
    expect(slabPayout(slab({ id: 'y', fromBps: 0, payoutKind: 'flat', amount: null }), 1000)).toBe(
      0,
    );
  });
});

describe('basisValue', () => {
  it('sizes every basis on the achieved figure the metric already resolved', () => {
    expect(basisValue('revenue', 250_000)).toBe(250_000);
    expect(basisValue('units', 40)).toBe(40);
    expect(basisValue('count', 18)).toBe(18);
  });
});

describe('computePayout', () => {
  it('earns the matching slab rate plus its bonus', () => {
    const result = computePayout({
      plan: plan(),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 110_000,
    });
    expect(result.attainmentBps).toBe(11000);
    expect(result.slabId).toBe('s2');
    expect(result.grossAmount).toBe(3300); // 3% of 110,000
    expect(result.bonusAmount).toBe(5000);
    expect(result.earnedAmount).toBe(8300);
    expect(result.payableAmount).toBe(8300);
    expect(result.reason).toBe('earned');
  });

  it('withholds the hold fraction from the payable amount', () => {
    const result = computePayout({
      plan: plan({ holdBps: 2500 }),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 110_000,
    });
    expect(result.earnedAmount).toBe(8300);
    expect(result.holdAmount).toBe(2075);
    expect(result.payableAmount).toBe(6225);
    expect(result.holdAmount + result.payableAmount).toBe(result.earnedAmount);
  });

  it('clips at the cap and says so', () => {
    const result = computePayout({
      plan: plan({ payoutCap: 6000 }),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 110_000,
    });
    expect(result.grossAmount).toBe(3300);
    expect(result.bonusAmount).toBe(5000);
    expect(result.earnedAmount).toBe(6000);
    expect(result.reason).toBe('capped');
  });

  it('takes the hold out of the capped amount, not the uncapped one', () => {
    const result = computePayout({
      plan: plan({ payoutCap: 6000, holdBps: 1000 }),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 110_000,
    });
    expect(result.holdAmount).toBe(600);
    expect(result.payableAmount).toBe(5400);
  });

  it('pays nothing below the plan minimum, whatever the slabs allow', () => {
    const result = computePayout({
      plan: plan({ minAttainmentBps: 9000 }),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 85_000,
    });
    expect(result.attainmentBps).toBe(8500);
    expect(result.reason).toBe('below_minimum');
    expect(result.earnedAmount).toBe(0);
    expect(result.slabId).toBeNull();
  });

  it('pays nothing when attainment falls under the lowest band', () => {
    const result = computePayout({
      plan: plan(),
      slabs: LADDER,
      targetValue: 100_000,
      achievedValue: 50_000,
    });
    expect(result.reason).toBe('no_matching_slab');
    expect(result.earnedAmount).toBe(0);
  });

  it('pays nothing when there is no target to measure against', () => {
    const result = computePayout({
      plan: plan(),
      slabs: LADDER,
      targetValue: 0,
      achievedValue: 500_000,
    });
    expect(result.attainmentBps).toBeNull();
    expect(result.reason).toBe('no_attainment');
    expect(result.earnedAmount).toBe(0);
  });

  it('reads slabs in band order however they arrive', () => {
    const shuffled = [LADDER[2], LADDER[0], LADDER[1]];
    expect(
      computePayout({ plan: plan(), slabs: shuffled, targetValue: 100_000, achievedValue: 90_000 })
        .slabId,
    ).toBe('s1');
  });

  it('rounds money to two places', () => {
    const result = computePayout({
      plan: plan({ holdBps: 3333 }),
      slabs: [slab({ id: 'odd', fromBps: 0, rateBps: 333 })],
      targetValue: 100_000,
      achievedValue: 33_333,
    });
    expect(result.grossAmount).toBe(1109.99); // 33,333 × 3.33% = 1,109.9889
    expect(result.holdAmount).toBe(369.96); // 33.33% of 1,109.99 = 369.9586
    expect(result.payableAmount).toBe(740.03);
  });
});

describe('summarizeIncentives', () => {
  function row(partial: Partial<Parameters<typeof summarizeIncentives>[0][number]> = {}) {
    return {
      attainmentBps: 5000,
      targetValue: 100_000,
      achievedValue: 50_000,
      earnedAmount: 1000,
      holdAmount: 0,
      payableAmount: 1000,
      paidAmount: 0,
      status: 'draft' as const,
      wonOrders: 2,
      ...partial,
    };
  }

  it('totals the four cards the report shows', () => {
    const summary = summarizeIncentives(
      [
        row({ targetValue: 2_000_000, achievedValue: 1_000_000, earnedAmount: 5000, wonOrders: 10 }),
        row({ targetValue: 1_500_000, achievedValue: 800_000, earnedAmount: 3500, wonOrders: 8 }),
      ],
      new Date('2026-09-21T00:00:00.000Z'),
    );
    expect(summary.totals.earnedAmount).toBe(8500);
    expect(summary.totals.achievedValue).toBe(1_800_000);
    expect(summary.totals.targetValue).toBe(3_500_000);
    expect(summary.totals.wonOrders).toBe(18);
    expect(summary.totals.completionBps).toBe(5143);
    expect(summary.generatedAt).toBe('2026-09-21T00:00:00.000Z');
  });

  it('keeps voided payouts out of every money total but still lists them', () => {
    const summary = summarizeIncentives([
      row({ earnedAmount: 1000, status: 'approved' }),
      row({ earnedAmount: 9999, status: 'void', wonOrders: 99 }),
    ]);
    expect(summary.totals.count).toBe(1);
    expect(summary.totals.earnedAmount).toBe(1000);
    expect(summary.totals.wonOrders).toBe(2);
    expect(summary.byStatus).toEqual([
      { status: 'approved', count: 1, earnedAmount: 1000 },
      { status: 'void', count: 1, earnedAmount: 9999 },
    ]);
  });

  it('averages only the rows that have an attainment', () => {
    const summary = summarizeIncentives([
      row({ attainmentBps: 4000 }),
      row({ attainmentBps: 8000 }),
      row({ attainmentBps: null }),
    ]);
    expect(summary.totals.averageAttainmentBps).toBe(6000);
  });

  it('returns empty totals rather than dividing by zero', () => {
    const summary = summarizeIncentives([]);
    expect(summary.totals.count).toBe(0);
    expect(summary.totals.earnedAmount).toBe(0);
    expect(summary.totals.completionBps).toBeNull();
    expect(summary.totals.averageAttainmentBps).toBeNull();
    expect(summary.byStatus).toEqual([]);
  });
});
