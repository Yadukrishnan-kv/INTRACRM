export const PERFORMANCE_KPI_CODES = [
  'lead_conversion',
  'follow_up_completion',
  'sales_achievement',
  'quotation_conversion',
] as const;

export type PerformanceKpiCode = (typeof PERFORMANCE_KPI_CODES)[number];

export const PERFORMANCE_WEIGHTS: Record<PerformanceKpiCode, number> = {
  lead_conversion: 2500,
  follow_up_completion: 2500,
  sales_achievement: 2500,
  quotation_conversion: 2500,
};

export const PERFORMANCE_KPI_CATALOG: Array<{
  code: PerformanceKpiCode;
  title: string;
  weightBps: number;
}> = [
  { code: 'lead_conversion', title: 'Lead conversion', weightBps: PERFORMANCE_WEIGHTS.lead_conversion },
  {
    code: 'follow_up_completion',
    title: 'Follow-up completion',
    weightBps: PERFORMANCE_WEIGHTS.follow_up_completion,
  },
  { code: 'sales_achievement', title: 'Sales achievement', weightBps: PERFORMANCE_WEIGHTS.sales_achievement },
  {
    code: 'quotation_conversion',
    title: 'Quotation conversion',
    weightBps: PERFORMANCE_WEIGHTS.quotation_conversion,
  },
];

export const SCORE_BANDS = ['outstanding', 'strong', 'average', 'needs_work', 'no_data'] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export function rateBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10000);
}

export function leadConversionBps(input: {
  created: number;
  won: number;
  lost: number;
}): number | null {
  const decided = input.won + input.lost;
  if (decided > 0) {
    return rateBps(input.won, decided);
  }
  if (input.created > 0) {
    return rateBps(input.won, input.created);
  }
  return null;
}

export function followUpCompletionBps(input: { due: number; completed: number }): number | null {
  if (input.due <= 0) {
    return null;
  }
  return rateBps(Math.min(input.completed, input.due), input.due);
}

export function quotationConversionBps(input: {
  sent: number;
  won: number;
  lost: number;
}): number | null {
  const decided = input.won + input.lost;
  if (decided > 0) {
    return rateBps(input.won, decided);
  }
  if (input.sent > 0) {
    return rateBps(input.won, input.sent);
  }
  return null;
}

export function salesAchievementBps(input: { target: number; achieved: number }): number | null {
  if (input.target <= 0) {
    return null;
  }
  return Math.round((input.achieved / input.target) * 10000);
}

export function scoreBandFor(scoreBps: number | null): ScoreBand {
  if (scoreBps == null) {
    return 'no_data';
  }
  if (scoreBps >= 8500) {
    return 'outstanding';
  }
  if (scoreBps >= 7000) {
    return 'strong';
  }
  if (scoreBps >= 5000) {
    return 'average';
  }
  return 'needs_work';
}

export type PerformanceKpis = {
  leadConversionBps: number | null;
  followUpCompletionBps: number | null;
  salesAchievementBps: number | null;
  quotationConversionBps: number | null;
};

export type PerformanceScore = {
  scoreBps: number | null;
  band: ScoreBand;
  weightUsedBps: number;
};

const KPI_CAP_BPS = 10000;

export function computePerformanceScore(kpis: PerformanceKpis): PerformanceScore {
  const parts: Array<{ value: number; weight: number }> = [];
  if (kpis.leadConversionBps != null) {
    parts.push({
      value: Math.min(KPI_CAP_BPS, kpis.leadConversionBps),
      weight: PERFORMANCE_WEIGHTS.lead_conversion,
    });
  }
  if (kpis.followUpCompletionBps != null) {
    parts.push({
      value: Math.min(KPI_CAP_BPS, kpis.followUpCompletionBps),
      weight: PERFORMANCE_WEIGHTS.follow_up_completion,
    });
  }
  if (kpis.salesAchievementBps != null) {
    parts.push({
      value: Math.min(KPI_CAP_BPS, Math.max(0, kpis.salesAchievementBps)),
      weight: PERFORMANCE_WEIGHTS.sales_achievement,
    });
  }
  if (kpis.quotationConversionBps != null) {
    parts.push({
      value: Math.min(KPI_CAP_BPS, kpis.quotationConversionBps),
      weight: PERFORMANCE_WEIGHTS.quotation_conversion,
    });
  }
  const weightUsedBps = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weightUsedBps <= 0) {
    return { scoreBps: null, band: 'no_data', weightUsedBps: 0 };
  }
  const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
  const scoreBps = Math.round(weighted / weightUsedBps);
  return { scoreBps, band: scoreBandFor(scoreBps), weightUsedBps };
}

export type Rankable = {
  id?: string;
  scoreBps: number | null;
  salesAchievementBps: number | null;
  revenueMinor: number;
  name: string;
};

export function comparePerformance(a: Rankable, b: Rankable): number {
  const scoreA = a.scoreBps ?? -1;
  const scoreB = b.scoreBps ?? -1;
  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }
  const salesA = a.salesAchievementBps ?? -1;
  const salesB = b.salesAchievementBps ?? -1;
  if (salesB !== salesA) {
    return salesB - salesA;
  }
  if (b.revenueMinor !== a.revenueMinor) {
    return b.revenueMinor - a.revenueMinor;
  }
  return a.name.localeCompare(b.name);
}

export function assignDenseRanks<T extends Rankable>(rows: T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort(comparePerformance);
  let previousScore: number | null | undefined;
  let dense = 0;
  return sorted.map((row) => {
    if (row.scoreBps !== previousScore) {
      dense += 1;
      previousScore = row.scoreBps;
    }
    return { ...row, rank: dense };
  });
}

export function assignTeamRanks<T extends Rankable & { id: string; teamId: string | null }>(
  rows: T[],
): Map<string, number> {
  const byTeam = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.teamId) {
      continue;
    }
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }
  const ranks = new Map<string, number>();
  for (const members of byTeam.values()) {
    for (const row of assignDenseRanks(members)) {
      ranks.set(row.id, row.rank);
    }
  }
  return ranks;
}

export function topByKpi<T>(
  rows: T[],
  score: (row: T) => number | null,
  limit: number,
): T[] {
  return [...rows]
    .filter((row) => score(row) != null)
    .sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1))
    .slice(0, limit);
}
