import { dateToYmd } from '../../targets/domain/target-period';
import {
  IncentiveBasis,
  PayoutKind,
  PayoutStatus,
  PlanStatus,
  Slab,
  planCoverageIssues,
  sortSlabs,
} from '../domain/incentive-engine';

export type SlabView = Slab & { planId: string };

export type PlanView = {
  id: string;
  name: string;
  description: string | null;
  metricCode: string;
  metricName: string;
  metricUnit: string;
  periodType: string;
  scopeType: string;
  basis: IncentiveBasis;
  status: PlanStatus;
  holdBps: number;
  minAttainmentBps: number;
  payoutCap: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  slabs: SlabView[];
  /** Gaps an author should fix before activating; empty on a sound ladder. */
  coverageIssues: string[];
  version: number;
};

export type PayoutView = {
  id: string;
  planId: string;
  planName: string;
  membershipId: string | null;
  membershipName: string | null;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  achievedValue: number;
  attainmentBps: number | null;
  slabId: string | null;
  slabLabel: string | null;
  earnedAmount: number;
  holdAmount: number;
  payableAmount: number;
  paidAmount: number;
  status: PayoutStatus;
  computedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  version: number;
};

type DecimalLike = { toString(): string } | number | null;

function num(value: DecimalLike): number {
  return value == null ? 0 : Number(value);
}

function nullableNum(value: DecimalLike): number | null {
  return value == null ? null : Number(value);
}

export type SlabRow = {
  id: string;
  planId: string;
  label: string | null;
  fromBps: number;
  toBps: number | null;
  payoutKind: PayoutKind | string;
  rateBps: number | null;
  amount: DecimalLike;
  perUnitAmount: DecimalLike;
  bonusAmount: DecimalLike;
};

export function toSlabView(row: SlabRow): SlabView {
  return {
    id: row.id,
    planId: row.planId,
    label: row.label,
    fromBps: row.fromBps,
    toBps: row.toBps,
    payoutKind: row.payoutKind as PayoutKind,
    rateBps: row.rateBps,
    amount: nullableNum(row.amount),
    perUnitAmount: nullableNum(row.perUnitAmount),
    bonusAmount: num(row.bonusAmount),
  };
}

export type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  metricCode: string;
  periodType: string;
  scopeType: string;
  basis: IncentiveBasis | string;
  status: PlanStatus | string;
  holdBps: number;
  minAttainmentBps: number;
  payoutCap: DecimalLike;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  version: number;
  kpi?: { name: string; unit: string } | null;
  slabs?: SlabRow[];
};

export function toPlanView(row: PlanRow): PlanView {
  const slabs = sortSlabs((row.slabs ?? []).map(toSlabView)) as SlabView[];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    metricCode: row.metricCode,
    metricName: row.kpi?.name ?? row.metricCode,
    metricUnit: row.kpi?.unit ?? 'count',
    periodType: row.periodType,
    scopeType: row.scopeType,
    basis: row.basis as IncentiveBasis,
    status: row.status as PlanStatus,
    holdBps: row.holdBps,
    minAttainmentBps: row.minAttainmentBps,
    payoutCap: nullableNum(row.payoutCap),
    effectiveFrom: dateToYmd(row.effectiveFrom) ?? '',
    effectiveTo: dateToYmd(row.effectiveTo),
    slabs,
    coverageIssues: planCoverageIssues(slabs),
    version: row.version,
  };
}

export type PayoutRow = {
  id: string;
  planId: string;
  membershipId: string | null;
  periodStart: Date | string;
  periodEnd: Date | string;
  targetValue: DecimalLike;
  achievedValue: DecimalLike;
  attainmentBps: number | null;
  slabId: string | null;
  earnedAmount: DecimalLike;
  holdAmount: DecimalLike;
  payableAmount: DecimalLike;
  paidAmount: DecimalLike;
  status: PayoutStatus | string;
  computedAt: Date;
  approvedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  version: number;
  plan?: { name: string } | null;
  membership?: { user: { fullName: string } } | null;
  slab?: { label: string | null } | null;
};

export function toPayoutView(row: PayoutRow): PayoutView {
  return {
    id: row.id,
    planId: row.planId,
    planName: row.plan?.name ?? '',
    membershipId: row.membershipId,
    membershipName: row.membership?.user.fullName ?? null,
    periodStart: dateToYmd(row.periodStart) ?? '',
    periodEnd: dateToYmd(row.periodEnd) ?? '',
    targetValue: num(row.targetValue),
    achievedValue: num(row.achievedValue),
    attainmentBps: row.attainmentBps,
    slabId: row.slabId,
    slabLabel: row.slab?.label ?? null,
    earnedAmount: num(row.earnedAmount),
    holdAmount: num(row.holdAmount),
    payableAmount: num(row.payableAmount),
    paidAmount: num(row.paidAmount),
    status: row.status as PayoutStatus,
    computedAt: row.computedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    notes: row.notes,
    version: row.version,
  };
}
