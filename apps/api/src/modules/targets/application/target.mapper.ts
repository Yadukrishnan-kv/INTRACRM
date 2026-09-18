import { computeAchievement, dateToYmd, periodLabel, targetKinds } from '../domain/target-period';
import type { ForecastBand } from '../domain/target-period';

export type TargetView = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  scopeName: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  metricCode: string;
  metricName: string;
  metricUnit: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  kinds: string[];
  targetValue: number;
  achievedValue: number;
  balance: number;
  remaining: number;
  achievementBps: number | null;
  attainmentBps: number | null;
  elapsedBps: number | null;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  plannedDaily: number;
  dailyRequired: number | null;
  expectedValue: number;
  variance: number;
  forecastValue: number | null;
  forecastBps: number | null;
  forecastBand: ForecastBand;
  onTrack: boolean;
  notes: string | null;
  version: number;
};

export type TargetMappedRow = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  productId: string | null;
  metricCode: string;
  periodType: string;
  periodStart: Date;
  periodEnd: Date;
  targetValue: { toString(): string } | number;
  notes: string | null;
  version: number;
  kpi?: { name: string; unit: string } | null;
  product?: { name: string; sku: string } | null;
};

export function toTargetView(input: {
  row: TargetMappedRow;
  achievedValue: number;
  today: string;
  scopeName: string | null;
}): TargetView {
  const periodStart = dateToYmd(input.row.periodStart) ?? input.today;
  const periodEnd = dateToYmd(input.row.periodEnd) ?? periodStart;
  const targetValue = Number(input.row.targetValue);
  const achievement = computeAchievement({
    achievedValue: input.achievedValue,
    targetValue,
    periodStart,
    periodEnd,
    today: input.today,
  });
  return {
    id: input.row.id,
    scopeType: input.row.scopeType,
    scopeId: input.row.scopeId,
    scopeName: input.scopeName,
    productId: input.row.productId,
    productName: input.row.product?.name ?? null,
    productSku: input.row.product?.sku ?? null,
    metricCode: input.row.metricCode,
    metricName: input.row.kpi?.name ?? input.row.metricCode,
    metricUnit: input.row.kpi?.unit ?? 'count',
    periodType: input.row.periodType,
    periodStart,
    periodEnd,
    periodLabel: periodLabel(input.row.periodType, periodStart, periodEnd),
    kinds: targetKinds({
      periodType: input.row.periodType,
      scopeType: input.row.scopeType,
      productId: input.row.productId,
    }),
    targetValue,
    achievedValue: input.achievedValue,
    balance: achievement.balance,
    remaining: achievement.remaining,
    achievementBps: achievement.achievementBps,
    attainmentBps: achievement.attainmentBps,
    elapsedBps: achievement.elapsedBps,
    daysTotal: achievement.daysTotal,
    daysElapsed: achievement.daysElapsed,
    daysRemaining: achievement.daysRemaining,
    plannedDaily: achievement.plannedDaily,
    dailyRequired: achievement.dailyRequired,
    expectedValue: achievement.expectedValue,
    variance: achievement.variance,
    forecastValue: achievement.forecastValue,
    forecastBps: achievement.forecastBps,
    forecastBand: achievement.forecastBand,
    onTrack: achievement.onTrack,
    notes: input.row.notes,
    version: input.row.version,
  };
}
