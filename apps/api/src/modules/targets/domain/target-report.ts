import { FORECAST_BANDS, PERIOD_TYPES, SCOPE_TYPES } from './target-period';
import type { ForecastBand } from './target-period';

export type TargetReportInput = {
  periodType: string;
  scopeType: string;
  productId: string | null;
  metricCode: string;
  metricName: string;
  targetValue: number;
  achievedValue: number;
  achievementBps: number | null;
  attainmentBps: number | null;
  balance: number;
  dailyRequired: number | null;
  forecastValue: number | null;
  forecastBps: number | null;
  forecastBand: ForecastBand;
  onTrack: boolean;
  scopeName: string | null;
  productName: string | null;
};

export type TargetReportView = {
  generatedAt: string;
  totals: {
    count: number;
    onTrack: number;
    behind: number;
    hit: number;
    missed: number;
    ahead: number;
    atRisk: number;
    averageAttainmentBps: number | null;
    averageForecastBps: number | null;
    targetValue: number;
    achievedValue: number;
    balance: number;
  };
  byPeriod: Array<{ periodType: string; count: number; onTrack: number; averageAttainmentBps: number | null }>;
  byScope: Array<{ scopeType: string; count: number; onTrack: number }>;
  byMetric: Array<{
    metricCode: string;
    metricName: string;
    count: number;
    targetValue: number;
    achievedValue: number;
    balance: number;
  }>;
  byForecast: Array<{ band: string; count: number }>;
  products: Array<{
    productId: string;
    productName: string | null;
    count: number;
    onTrack: number;
  }>;
  teams: Array<{
    scopeName: string | null;
    count: number;
    onTrack: number;
    averageAttainmentBps: number | null;
  }>;
};

function averageBps(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length === 0) {
    return null;
  }
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

export function summarizeTargets(
  rows: TargetReportInput[],
  generatedAt = new Date(),
): TargetReportView {
  const byPeriod = new Map<string, { count: number; onTrack: number; bps: number[] }>();
  const byScope = new Map<string, { count: number; onTrack: number }>();
  const byMetric = new Map<
    string,
    {
      metricCode: string;
      metricName: string;
      count: number;
      targetValue: number;
      achievedValue: number;
      balance: number;
    }
  >();
  const products = new Map<string, { productId: string; productName: string | null; count: number; onTrack: number }>();
  const teams = new Map<
    string,
    { scopeName: string | null; count: number; onTrack: number; bps: number[] }
  >();

  let onTrack = 0;
  let hit = 0;
  let targetValue = 0;
  let achievedValue = 0;
  let balance = 0;
  const forecastCounts: Record<ForecastBand, number> = {
    not_started: 0,
    hit: 0,
    ahead: 0,
    on_track: 0,
    at_risk: 0,
    behind: 0,
    missed: 0,
  };

  for (const row of rows) {
    targetValue += row.targetValue;
    achievedValue += row.achievedValue;
    balance += row.balance;
    forecastCounts[row.forecastBand] += 1;
    if (row.onTrack) {
      onTrack += 1;
    }
    if ((row.achievementBps ?? row.attainmentBps ?? 0) >= 10000) {
      hit += 1;
    }

    const period = byPeriod.get(row.periodType) ?? { count: 0, onTrack: 0, bps: [] };
    period.count += 1;
    if (row.onTrack) {
      period.onTrack += 1;
    }
    if (row.attainmentBps != null) {
      period.bps.push(row.attainmentBps);
    }
    byPeriod.set(row.periodType, period);

    const scope = byScope.get(row.scopeType) ?? { count: 0, onTrack: 0 };
    scope.count += 1;
    if (row.onTrack) {
      scope.onTrack += 1;
    }
    byScope.set(row.scopeType, scope);

    const metric = byMetric.get(row.metricCode) ?? {
      metricCode: row.metricCode,
      metricName: row.metricName,
      count: 0,
      targetValue: 0,
      achievedValue: 0,
      balance: 0,
    };
    metric.count += 1;
    metric.targetValue += row.targetValue;
    metric.achievedValue += row.achievedValue;
    metric.balance += row.balance;
    byMetric.set(row.metricCode, metric);

    if (row.productId) {
      const product = products.get(row.productId) ?? {
        productId: row.productId,
        productName: row.productName,
        count: 0,
        onTrack: 0,
      };
      product.count += 1;
      if (row.onTrack) {
        product.onTrack += 1;
      }
      products.set(row.productId, product);
    }

    if (row.scopeType === 'team') {
      const key = row.scopeName ?? 'team';
      const team = teams.get(key) ?? { scopeName: row.scopeName, count: 0, onTrack: 0, bps: [] };
      team.count += 1;
      if (row.onTrack) {
        team.onTrack += 1;
      }
      if (row.attainmentBps != null) {
        team.bps.push(row.attainmentBps);
      }
      teams.set(key, team);
    }
  }

  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      count: rows.length,
      onTrack,
      behind: rows.length - onTrack,
      hit,
      missed: forecastCounts.missed,
      ahead: forecastCounts.ahead,
      atRisk: forecastCounts.at_risk,
      averageAttainmentBps: averageBps(rows.map((row) => row.achievementBps ?? row.attainmentBps)),
      averageForecastBps: averageBps(rows.map((row) => row.forecastBps)),
      targetValue,
      achievedValue,
      balance,
    },
    byPeriod: PERIOD_TYPES.map((periodType) => {
      const bucket = byPeriod.get(periodType);
      return {
        periodType,
        count: bucket?.count ?? 0,
        onTrack: bucket?.onTrack ?? 0,
        averageAttainmentBps: averageBps(bucket?.bps ?? []),
      };
    }).filter((row) => row.count > 0),
    byScope: SCOPE_TYPES.map((scopeType) => {
      const bucket = byScope.get(scopeType);
      return {
        scopeType,
        count: bucket?.count ?? 0,
        onTrack: bucket?.onTrack ?? 0,
      };
    }).filter((row) => row.count > 0),
    byMetric: [...byMetric.values()].sort((a, b) => b.targetValue - a.targetValue),
    byForecast: FORECAST_BANDS.map((band) => ({ band, count: forecastCounts[band] })).filter(
      (row) => row.count > 0,
    ),
    products: [...products.values()].sort((a, b) => b.count - a.count),
    teams: [...teams.values()]
      .map((team) => ({
        scopeName: team.scopeName,
        count: team.count,
        onTrack: team.onTrack,
        averageAttainmentBps: averageBps(team.bps),
      }))
      .sort((a, b) => (b.averageAttainmentBps ?? 0) - (a.averageAttainmentBps ?? 0)),
  };
}
