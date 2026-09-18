import type { MixSlice, SeriesPoint } from '../../dashboard/domain/dashboard-metrics';

export const ANALYTICS_METRIC_CODES = [
  'leads',
  'qualified',
  'quotations',
  'won',
  'conversion',
] as const;

export type AnalyticsMetricCode = (typeof ANALYTICS_METRIC_CODES)[number];

export const ANALYTICS_METRIC_CATALOG: Array<{ code: AnalyticsMetricCode; title: string }> = [
  { code: 'leads', title: 'Leads' },
  { code: 'qualified', title: 'Qualified' },
  { code: 'quotations', title: 'Quotations' },
  { code: 'won', title: 'Won' },
  { code: 'conversion', title: 'Conversion' },
];

export function isAnalyticsMetricCode(value: string): value is AnalyticsMetricCode {
  return (ANALYTICS_METRIC_CODES as readonly string[]).includes(value);
}

export type PipelineStageRef = {
  id: string;
  pipelineId: string;
  code: string;
  name: string;
  sortOrder: number;
  winProbabilityBps: number;
  isWon: boolean;
  isLost: boolean;
};

const QUALIFIED_WIN_PROBABILITY_BPS = 4000;

export function isQualifiedName(code: string, name: string): boolean {
  const token = `${code} ${name}`.toLowerCase();
  return token.includes('qualified');
}

export function qualifiedStageIds(stages: PipelineStageRef[]): Set<string> {
  const ids = new Set<string>();
  const byPipeline = new Map<string, PipelineStageRef[]>();
  for (const stage of stages) {
    const group = byPipeline.get(stage.pipelineId) ?? [];
    group.push(stage);
    byPipeline.set(stage.pipelineId, group);
  }
  for (const group of byPipeline.values()) {
    for (const id of qualifiedIdsInPipeline(group)) {
      ids.add(id);
    }
  }
  return ids;
}

export function qualifiedIdsInPipeline(stages: PipelineStageRef[]): Set<string> {
  const ordered = [...stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const named = ordered.find((stage) => isQualifiedName(stage.code, stage.name));
  const probable = ordered.find(
    (stage) => !stage.isWon && !stage.isLost && stage.winProbabilityBps >= QUALIFIED_WIN_PROBABILITY_BPS,
  );
  const open = ordered.filter((stage) => !stage.isWon && !stage.isLost);
  const start = named ?? probable ?? open[2];
  if (!start) {
    return new Set();
  }
  return new Set(
    ordered.filter((stage) => stage.sortOrder >= start.sortOrder && !stage.isLost).map((stage) => stage.id),
  );
}

export function rateBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10000);
}

export type FunnelCounts = {
  leads: number;
  qualified: number;
  quotations: number;
  quotedLeads: number;
  won: number;
};

export type FunnelStep = {
  code: Exclude<AnalyticsMetricCode, 'conversion'>;
  label: string;
  value: number;
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
};

export type FunnelConversion = {
  leadToQualifiedBps: number | null;
  qualifiedToQuotationBps: number | null;
  quotationToWonBps: number | null;
  overallBps: number | null;
};

export type FunnelView = {
  steps: FunnelStep[];
  conversion: FunnelConversion;
};

export function buildFunnel(counts: FunnelCounts): FunnelView {
  const steps: FunnelStep[] = [
    {
      code: 'leads',
      label: 'Leads',
      value: counts.leads,
      conversionFromPreviousBps: 10000,
      dropOffCount: null,
    },
    {
      code: 'qualified',
      label: 'Qualified',
      value: counts.qualified,
      conversionFromPreviousBps: rateBps(counts.qualified, counts.leads),
      dropOffCount: Math.max(counts.leads - counts.qualified, 0),
    },
    {
      code: 'quotations',
      label: 'Quotations',
      value: counts.quotations,
      conversionFromPreviousBps: rateBps(counts.quotedLeads, counts.qualified),
      dropOffCount: Math.max(counts.qualified - counts.quotedLeads, 0),
    },
    {
      code: 'won',
      label: 'Won',
      value: counts.won,
      conversionFromPreviousBps: rateBps(counts.won, counts.quotations),
      dropOffCount: Math.max(counts.quotations - counts.won, 0),
    },
  ];
  return {
    steps,
    conversion: {
      leadToQualifiedBps: rateBps(counts.qualified, counts.leads),
      qualifiedToQuotationBps: rateBps(counts.quotedLeads, counts.qualified),
      quotationToWonBps: rateBps(counts.won, counts.quotations),
      overallBps: rateBps(counts.won, counts.leads),
    },
  };
}

export type TimestampedId = {
  id: string;
  at: Date;
};

export function firstTouch(rows: TimestampedId[]): TimestampedId[] {
  const earliest = new Map<string, Date>();
  for (const row of rows) {
    const previous = earliest.get(row.id);
    if (!previous || row.at < previous) {
      earliest.set(row.id, row.at);
    }
  }
  return [...earliest.entries()].map(([id, at]) => ({ id, at }));
}

export function firstTouchInRange(
  rows: TimestampedId[],
  earlierIds: Iterable<string>,
  range: { gte: Date; lt: Date },
): TimestampedId[] {
  const seenEarlier = new Set(earlierIds);
  return firstTouch(rows).filter((row) => {
    if (seenEarlier.has(row.id)) {
      return false;
    }
    return row.at >= range.gte && row.at < range.lt;
  });
}

export function uniqueCount(ids: Iterable<string>): number {
  return new Set(ids).size;
}

export type AnalyticsWidgetView = {
  code: AnalyticsMetricCode;
  title: string;
  primary: number;
  primaryLabel: string;
  previous: number;
  deltaBps: number | null;
  month: number;
  metrics: Array<{ code: string; label: string; value: number }>;
  series: SeriesPoint[];
  mix: MixSlice[];
};

export function toAnalyticsWidget(input: {
  code: AnalyticsMetricCode;
  primary: number;
  primaryLabel: string;
  previous: number;
  deltaBps: number | null;
  month: number;
  metrics: Array<{ code: string; label: string; value: number }>;
  series: SeriesPoint[];
  mix: MixSlice[];
}): AnalyticsWidgetView {
  const title = ANALYTICS_METRIC_CATALOG.find((item) => item.code === input.code)?.title ?? input.code;
  return {
    code: input.code,
    title,
    primary: input.primary,
    primaryLabel: input.primaryLabel,
    previous: input.previous,
    deltaBps: input.deltaBps,
    month: input.month,
    metrics: input.metrics,
    series: input.series,
    mix: input.mix.filter((item) => item.value > 0),
  };
}
