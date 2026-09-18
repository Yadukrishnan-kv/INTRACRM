export type StageSnapshot = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  winProbabilityBps: number;
  isWon: boolean;
  isLost: boolean;
  currentCount: number;
  currentValueMinor: number;
  reachedCount: number;
};

export type ConversionTotalsInput = {
  open: number;
  won: number;
  lost: number;
  pipelineValueMinor: number;
  wonValueMinor: number;
};

export type StageFunnelRow = StageSnapshot & {
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
};

export type ConversionAnalytics = {
  totals: ConversionTotalsInput & {
    leads: number;
    winRateBps: number | null;
    conversionBps: number | null;
  };
  stages: StageFunnelRow[];
};

export function rateBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10000);
}

export function summarizeConversion(
  stages: StageSnapshot[],
  totals: ConversionTotalsInput,
): ConversionAnalytics {
  const ordered = [...stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const funnel: StageFunnelRow[] = ordered.map((stage, index) => {
    const previous = index === 0 ? null : ordered[index - 1];
    const conversionFromPreviousBps = previous
      ? rateBps(stage.reachedCount, previous.reachedCount)
      : 10000;
    const dropOffCount = previous
      ? Math.max(previous.reachedCount - stage.reachedCount, 0)
      : null;
    return { ...stage, conversionFromPreviousBps, dropOffCount };
  });
  const leads = totals.open + totals.won + totals.lost;
  return {
    totals: {
      ...totals,
      leads,
      winRateBps: rateBps(totals.won, totals.won + totals.lost),
      conversionBps: rateBps(totals.won, leads),
    },
    stages: funnel,
  };
}
