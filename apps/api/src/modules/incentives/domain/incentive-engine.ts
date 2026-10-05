/**
 * Incentive computation. A plan defines the measurement and the withholding
 * policy; its slabs define the payout inside each attainment band; this module
 * turns one (plan, slabs, achievement) triple into one payout.
 *
 * Pure by design: the same inputs must always produce the same figure, because
 * an approved payout is money someone is owed and has to be reproducible from
 * the stored snapshot.
 */

export const INCENTIVE_BASES = ['revenue', 'units', 'count'] as const;
export type IncentiveBasis = (typeof INCENTIVE_BASES)[number];

export const PAYOUT_KINDS = ['percent', 'flat', 'per_unit'] as const;
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

export const PLAN_STATUSES = ['draft', 'active', 'archived'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PAYOUT_STATUSES = ['draft', 'approved', 'paid', 'void'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const BASIS_CATALOG: Array<{ code: IncentiveBasis; title: string; description: string }> = [
  { code: 'revenue', title: 'Revenue', description: 'Payout scales with won value' },
  { code: 'units', title: 'Units', description: 'Payout scales with units sold' },
  { code: 'count', title: 'Count', description: 'Payout scales with a plain count' },
];

export const PAYOUT_KIND_CATALOG: Array<{ code: PayoutKind; title: string; description: string }> =
  [
    { code: 'percent', title: 'Percent of basis', description: 'rateBps applied to the basis' },
    { code: 'flat', title: 'Flat amount', description: 'Fixed amount once the band is reached' },
    { code: 'per_unit', title: 'Per unit', description: 'Amount multiplied by the basis' },
  ];

export type Slab = {
  id: string;
  label: string | null;
  /** Half-open band on attainment basis points: [fromBps, toBps). */
  fromBps: number;
  toBps: number | null;
  payoutKind: PayoutKind;
  rateBps: number | null;
  amount: number | null;
  perUnitAmount: number | null;
  bonusAmount: number;
};

export type Plan = {
  id: string;
  name: string;
  basis: IncentiveBasis;
  holdBps: number;
  minAttainmentBps: number;
  payoutCap: number | null;
};

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  // Nudge off the binary representation before rounding so 8.985 does not
  // round down to 8.98.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Attainment in basis points. A zero target has no attainment to speak of —
 * `null`, not 0% and not infinity — and the caller decides what that means.
 */
export function attainmentBps(achievedValue: number, targetValue: number): number | null {
  if (targetValue <= 0) {
    return null;
  }
  return Math.round((achievedValue / targetValue) * 10000);
}

/**
 * The one slab covering an attainment. The database forbids overlap, so at
 * most one can match; below every band, or above a closed top band, nothing
 * matches and nothing is earned.
 */
export function resolveSlab(slabs: Slab[], bps: number): Slab | null {
  return (
    slabs.find((slab) => bps >= slab.fromBps && (slab.toBps == null || bps < slab.toBps)) ?? null
  );
}

/** Slabs in band order — how they are shown, and the order `resolveSlab` reads. */
export function sortSlabs(slabs: Slab[]): Slab[] {
  return [...slabs].sort((a, b) => a.fromBps - b.fromBps);
}

/**
 * Gaps and overlaps a plan author should see before activating a plan. The
 * exclusion constraint already rejects overlaps at write time; this reports
 * the softer problems too, so the UI can warn rather than fail.
 */
export function planCoverageIssues(slabs: Slab[]): string[] {
  const sorted = sortSlabs(slabs);
  const issues: string[] = [];
  if (sorted.length === 0) {
    return ['Plan has no slabs, so nothing can be earned.'];
  }
  sorted.forEach((slab, index) => {
    const next = sorted[index + 1];
    if (next == null) {
      return;
    }
    if (slab.toBps == null) {
      issues.push(`Slab from ${slab.fromBps} is open-ended but is not the last slab.`);
      return;
    }
    if (next.fromBps > slab.toBps) {
      issues.push(`Attainment ${slab.toBps}–${next.fromBps} bps is not covered by any slab.`);
    }
    if (next.fromBps < slab.toBps) {
      issues.push(`Slabs ${slab.fromBps}– and ${next.fromBps}– overlap.`);
    }
  });
  return issues;
}

/**
 * The value a payout is sized against. Revenue pays on money booked, units and
 * count pay on the same achieved figure — the difference is what the target's
 * metric counts, which the caller has already resolved.
 */
export function basisValue(basis: IncentiveBasis, achievedValue: number): number {
  switch (basis) {
    case 'revenue':
    case 'units':
    case 'count':
      return achievedValue;
  }
}

export function slabPayout(slab: Slab, basis: number): number {
  switch (slab.payoutKind) {
    case 'percent':
      return round2((basis * (slab.rateBps ?? 0)) / 10000);
    case 'flat':
      return round2(slab.amount ?? 0);
    case 'per_unit':
      return round2(basis * (slab.perUnitAmount ?? 0));
  }
}

export type ComputeInput = {
  plan: Plan;
  slabs: Slab[];
  targetValue: number;
  achievedValue: number;
};

export type ComputedPayout = {
  targetValue: number;
  achievedValue: number;
  attainmentBps: number | null;
  basisValue: number;
  slabId: string | null;
  slabLabel: string | null;
  grossAmount: number;
  bonusAmount: number;
  cappedAmount: number;
  earnedAmount: number;
  holdAmount: number;
  payableAmount: number;
  /** Why the payout is what it is, for the breakdown on the report. */
  reason:
    | 'below_minimum'
    | 'no_matching_slab'
    | 'no_attainment'
    | 'capped'
    | 'earned';
};

/**
 * One period, one person, one plan. Order matters and is fixed:
 * attainment → minimum gate → slab → gross + bonus → cap → hold split.
 */
export function computePayout(input: ComputeInput): ComputedPayout {
  const { plan } = input;
  const bps = attainmentBps(input.achievedValue, input.targetValue);
  const basis = basisValue(plan.basis, input.achievedValue);

  const empty = (reason: ComputedPayout['reason']): ComputedPayout => ({
    targetValue: round2(input.targetValue),
    achievedValue: round2(input.achievedValue),
    attainmentBps: bps,
    basisValue: round2(basis),
    slabId: null,
    slabLabel: null,
    grossAmount: 0,
    bonusAmount: 0,
    cappedAmount: 0,
    earnedAmount: 0,
    holdAmount: 0,
    payableAmount: 0,
    reason,
  });

  if (bps == null) {
    return empty('no_attainment');
  }
  if (bps < plan.minAttainmentBps) {
    return empty('below_minimum');
  }

  const slab = resolveSlab(sortSlabs(input.slabs), bps);
  if (slab == null) {
    return empty('no_matching_slab');
  }

  const gross = slabPayout(slab, basis);
  const bonus = round2(slab.bonusAmount);
  const beforeCap = round2(gross + bonus);
  const capped =
    plan.payoutCap != null && beforeCap > plan.payoutCap ? round2(plan.payoutCap) : beforeCap;
  const hold = round2((capped * plan.holdBps) / 10000);
  const payable = round2(capped - hold);

  return {
    targetValue: round2(input.targetValue),
    achievedValue: round2(input.achievedValue),
    attainmentBps: bps,
    basisValue: round2(basis),
    slabId: slab.id,
    slabLabel: slab.label,
    grossAmount: gross,
    bonusAmount: bonus,
    cappedAmount: capped,
    earnedAmount: capped,
    holdAmount: hold,
    payableAmount: payable,
    reason: capped < beforeCap ? 'capped' : 'earned',
  };
}

export type IncentiveSummaryRow = {
  attainmentBps: number | null;
  targetValue: number;
  achievedValue: number;
  earnedAmount: number;
  holdAmount: number;
  payableAmount: number;
  paidAmount: number;
  status: PayoutStatus;
  wonOrders: number;
};

export type IncentiveSummary = {
  generatedAt: string;
  totals: {
    count: number;
    targetValue: number;
    achievedValue: number;
    /** Live payouts only — a voided one is excluded from every money total. */
    earnedAmount: number;
    holdAmount: number;
    payableAmount: number;
    paidAmount: number;
    wonOrders: number;
    completionBps: number | null;
    averageAttainmentBps: number | null;
  };
  byStatus: Array<{ status: PayoutStatus; count: number; earnedAmount: number }>;
};

/**
 * The four cards on the report — earned incentive, target achievement, won
 * orders and completion — plus the status split underneath them.
 */
export function summarizeIncentives(
  rows: IncentiveSummaryRow[],
  generatedAt = new Date(),
): IncentiveSummary {
  const live = rows.filter((row) => row.status !== 'void');
  const totals = live.reduce(
    (acc, row) => {
      acc.targetValue += row.targetValue;
      acc.achievedValue += row.achievedValue;
      acc.earnedAmount += row.earnedAmount;
      acc.holdAmount += row.holdAmount;
      acc.payableAmount += row.payableAmount;
      acc.paidAmount += row.paidAmount;
      acc.wonOrders += row.wonOrders;
      return acc;
    },
    {
      targetValue: 0,
      achievedValue: 0,
      earnedAmount: 0,
      holdAmount: 0,
      payableAmount: 0,
      paidAmount: 0,
      wonOrders: 0,
    },
  );

  const scored = live
    .map((row) => row.attainmentBps)
    .filter((bps): bps is number => bps != null);

  const byStatus = PAYOUT_STATUSES.map((status) => {
    const bucket = rows.filter((row) => row.status === status);
    return {
      status,
      count: bucket.length,
      earnedAmount: round2(bucket.reduce((sum, row) => sum + row.earnedAmount, 0)),
    };
  }).filter((row) => row.count > 0);

  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      count: live.length,
      targetValue: round2(totals.targetValue),
      achievedValue: round2(totals.achievedValue),
      earnedAmount: round2(totals.earnedAmount),
      holdAmount: round2(totals.holdAmount),
      payableAmount: round2(totals.payableAmount),
      paidAmount: round2(totals.paidAmount),
      wonOrders: totals.wonOrders,
      completionBps: attainmentBps(totals.achievedValue, totals.targetValue),
      averageAttainmentBps:
        scored.length === 0
          ? null
          : Math.round(scored.reduce((sum, bps) => sum + bps, 0) / scored.length),
    },
    byStatus,
  };
}
