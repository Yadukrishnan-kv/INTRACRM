import type { MixSlice, SeriesPoint } from '../../dashboard/domain/dashboard-metrics';
import { buildSeries, dayLabel } from '../../dashboard/domain/dashboard-metrics';
import { rateBps, type PipelineStageRef, type TimestampedId } from './funnel-metrics';

export const FUNNEL_REPORT_STAGE_CODES = [
  'lead',
  'qualified',
  'quotation',
  'negotiation',
  'won',
] as const;

export type FunnelReportStageCode = (typeof FUNNEL_REPORT_STAGE_CODES)[number];

export const FUNNEL_REPORT_STAGES: Array<{ code: FunnelReportStageCode; label: string }> = [
  { code: 'lead', label: 'Lead' },
  { code: 'qualified', label: 'Qualified' },
  { code: 'quotation', label: 'Quotation' },
  { code: 'negotiation', label: 'Negotiation' },
  { code: 'won', label: 'Won' },
];

export const FUNNEL_REPORT_RANK: Record<FunnelReportStageCode, number> = {
  lead: 0,
  qualified: 1,
  quotation: 2,
  negotiation: 3,
  won: 4,
};

function token(stage: PipelineStageRef): string {
  return `${stage.code} ${stage.name}`.toLowerCase();
}

function firstIndex(
  ordered: PipelineStageRef[],
  match: (stage: PipelineStageRef) => boolean,
): number {
  return ordered.findIndex(match);
}

function monotonic(indexes: number[]): [number, number, number, number] {
  const next = [...indexes];
  for (let index = 1; index < next.length; index += 1) {
    const current = next[index] ?? -1;
    if (current < 0) {
      continue;
    }
    const previous = next
      .slice(0, index)
      .filter((value) => value >= 0)
      .reduce((max, value) => Math.max(max, value), -1);
    if (previous >= 0 && current < previous) {
      next[index] = previous;
    }
  }
  return [next[0] ?? -1, next[1] ?? -1, next[2] ?? -1, next[3] ?? -1];
}

export function mapPipelineToFunnel(stages: PipelineStageRef[]): Map<string, FunnelReportStageCode> {
  const ordered = [...stages].filter((stage) => !stage.isLost).sort((left, right) => left.sortOrder - right.sortOrder);
  const qualifiedIndex = firstIndex(
    ordered,
    (stage) => token(stage).includes('qualified') || (!stage.isWon && stage.winProbabilityBps >= 4000),
  );
  const quotationIndex = firstIndex(
    ordered,
    (stage) => /\bquot/.test(token(stage)) || (!stage.isWon && stage.winProbabilityBps >= 7000),
  );
  const negotiationIndex = firstIndex(
    ordered,
    (stage) => token(stage).includes('negotiat') || (!stage.isWon && stage.winProbabilityBps >= 8500),
  );
  const wonIndex = firstIndex(ordered, (stage) => stage.isWon || token(stage).includes('won'));
  const [qualified, quotation, negotiation, won] = monotonic([
    qualifiedIndex,
    quotationIndex,
    negotiationIndex,
    wonIndex,
  ]);
  const mapped = new Map<string, FunnelReportStageCode>();
  ordered.forEach((stage, index) => {
    if (won >= 0 && index >= won) {
      mapped.set(stage.id, 'won');
      return;
    }
    if (negotiation >= 0 && index >= negotiation) {
      mapped.set(stage.id, 'negotiation');
      return;
    }
    if (quotation >= 0 && index >= quotation) {
      mapped.set(stage.id, 'quotation');
      return;
    }
    if (qualified >= 0 && index >= qualified) {
      mapped.set(stage.id, 'qualified');
      return;
    }
    mapped.set(stage.id, 'lead');
  });
  return mapped;
}

export function mapStagesToFunnel(stages: PipelineStageRef[]): Map<string, FunnelReportStageCode> {
  const mapped = new Map<string, FunnelReportStageCode>();
  const byPipeline = new Map<string, PipelineStageRef[]>();
  for (const stage of stages) {
    const group = byPipeline.get(stage.pipelineId) ?? [];
    group.push(stage);
    byPipeline.set(stage.pipelineId, group);
  }
  for (const group of byPipeline.values()) {
    for (const [id, code] of mapPipelineToFunnel(group)) {
      mapped.set(id, code);
    }
  }
  return mapped;
}

export type FunnelLeadSnapshot = {
  id: string;
  stageId: string;
  valueMinor: number;
  createdAt: Date;
};

export type FunnelStageChange = TimestampedId & {
  leadId: string;
  toStageId: string;
};

export type FunnelReportStageView = {
  code: FunnelReportStageCode;
  label: string;
  rank: number;
  currentCount: number;
  reachedCount: number;
  currentValueMinor: number;
  reachedValueMinor: number;
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
  series: SeriesPoint[];
};

export type FunnelTrendPoint = {
  date: string;
  label: string;
} & Record<FunnelReportStageCode, number>;

export type FunnelReportView = {
  stages: FunnelReportStageView[];
  conversion: {
    leadToQualifiedBps: number | null;
    qualifiedToQuotationBps: number | null;
    quotationToNegotiationBps: number | null;
    negotiationToWonBps: number | null;
    overallBps: number | null;
  };
  charts: {
    funnel: MixSlice[];
    current: MixSlice[];
    conversion: MixSlice[];
    trend: FunnelTrendPoint[];
  };
};

function emptyCounts(): Record<FunnelReportStageCode, number> {
  return { lead: 0, qualified: 0, quotation: 0, negotiation: 0, won: 0 };
}

export function buildFunnelReport(input: {
  stages: PipelineStageRef[];
  leads: FunnelLeadSnapshot[];
  changes: FunnelStageChange[];
  days: string[];
  timeZone: string;
}): FunnelReportView {
  const stageMap = mapStagesToFunnel(input.stages);
  const rankOf = (stageId: string): number | null => {
    const code = stageMap.get(stageId);
    return code == null ? null : FUNNEL_REPORT_RANK[code];
  };
  const current = emptyCounts();
  const currentValue = emptyCounts();
  const reached = emptyCounts();
  const reachedValue = emptyCounts();
  const maxRank = new Map<string, number>();
  const firstAtRank = new Map<string, Date[]>();

  const touch = (leadId: string, rank: number, at: Date) => {
    const previous = maxRank.get(leadId) ?? -1;
    if (rank > previous) {
      maxRank.set(leadId, rank);
    }
    const first = firstAtRank.get(leadId) ?? [];
    for (let index = 0; index <= rank; index += 1) {
      const seen = first[index];
      if (seen == null || at < seen) {
        first[index] = at;
      }
    }
    firstAtRank.set(leadId, first);
  };

  for (const lead of input.leads) {
    touch(lead.id, FUNNEL_REPORT_RANK.lead, lead.createdAt);
    const rank = rankOf(lead.stageId);
    if (rank != null) {
      const code = FUNNEL_REPORT_STAGE_CODES[rank] ?? 'lead';
      current[code] += 1;
      currentValue[code] += lead.valueMinor;
    }
  }
  for (const change of input.changes) {
    const rank = rankOf(change.toStageId);
    if (rank == null) {
      continue;
    }
    touch(change.leadId, rank, change.at);
  }
  for (const lead of input.leads) {
    const rank = rankOf(lead.stageId);
    const first = firstAtRank.get(lead.id) ?? [];
    if (rank != null && first[rank] == null) {
      touch(lead.id, rank, lead.createdAt);
    }
  }

  for (const lead of input.leads) {
    const peak = maxRank.get(lead.id) ?? FUNNEL_REPORT_RANK.lead;
    for (const code of FUNNEL_REPORT_STAGE_CODES) {
      if (peak >= FUNNEL_REPORT_RANK[code]) {
        reached[code] += 1;
        reachedValue[code] += lead.valueMinor;
      }
    }
  }

  const firstTouches: Record<FunnelReportStageCode, TimestampedId[]> = {
    lead: [],
    qualified: [],
    quotation: [],
    negotiation: [],
    won: [],
  };
  for (const [leadId, first] of firstAtRank) {
    for (const code of FUNNEL_REPORT_STAGE_CODES) {
      const at = first[FUNNEL_REPORT_RANK[code]];
      if (at) {
        firstTouches[code].push({ id: leadId, at });
      }
    }
  }

  const stages: FunnelReportStageView[] = FUNNEL_REPORT_STAGES.map((stage, index) => {
    const previous = index === 0 ? null : FUNNEL_REPORT_STAGES[index - 1];
    const reachedCount = reached[stage.code];
    const previousReached = previous ? reached[previous.code] : null;
    return {
      code: stage.code,
      label: stage.label,
      rank: FUNNEL_REPORT_RANK[stage.code],
      currentCount: current[stage.code],
      reachedCount,
      currentValueMinor: currentValue[stage.code],
      reachedValueMinor: reachedValue[stage.code],
      conversionFromPreviousBps:
        previousReached == null ? 10000 : rateBps(reachedCount, previousReached),
      dropOffCount: previousReached == null ? null : Math.max(previousReached - reachedCount, 0),
      series: buildSeries(
        input.days,
        firstTouches[stage.code].map((row) => ({ at: row.at })),
        input.timeZone,
      ),
    };
  });

  const conversion = {
    leadToQualifiedBps: rateBps(reached.qualified, reached.lead),
    qualifiedToQuotationBps: rateBps(reached.quotation, reached.qualified),
    quotationToNegotiationBps: rateBps(reached.negotiation, reached.quotation),
    negotiationToWonBps: rateBps(reached.won, reached.negotiation),
    overallBps: rateBps(reached.won, reached.lead),
  };

  const trend: FunnelTrendPoint[] = input.days.map((date) => {
    const point: FunnelTrendPoint = {
      date,
      label: dayLabel(date),
      lead: 0,
      qualified: 0,
      quotation: 0,
      negotiation: 0,
      won: 0,
    };
    for (const stage of stages) {
      point[stage.code] = stage.series.find((item) => item.date === date)?.value ?? 0;
    }
    return point;
  });

  return {
    stages,
    conversion,
    charts: {
      funnel: stages.map((stage) => ({
        code: stage.code,
        label: stage.label,
        value: stage.reachedCount,
      })),
      current: stages
        .map((stage) => ({
          code: stage.code,
          label: stage.label,
          value: stage.currentCount,
        }))
        .filter((item) => item.value > 0),
      conversion: [
        { code: 'lead_to_qualified', label: 'Lead → Qualified', value: conversion.leadToQualifiedBps ?? 0 },
        {
          code: 'qualified_to_quotation',
          label: 'Qualified → Quotation',
          value: conversion.qualifiedToQuotationBps ?? 0,
        },
        {
          code: 'quotation_to_negotiation',
          label: 'Quotation → Negotiation',
          value: conversion.quotationToNegotiationBps ?? 0,
        },
        { code: 'negotiation_to_won', label: 'Negotiation → Won', value: conversion.negotiationToWonBps ?? 0 },
        { code: 'overall', label: 'Lead → Won', value: conversion.overallBps ?? 0 },
      ].filter((item) => item.value > 0),
      trend,
    },
  };
}
