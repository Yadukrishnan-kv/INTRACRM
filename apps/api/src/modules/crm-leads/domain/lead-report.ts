export const LEAD_LIFECYCLE_STATUSES = [
  'open',
  'won',
  'lost',
  'unqualified',
  'recycled',
] as const;
export type LeadLifecycleCode = (typeof LEAD_LIFECYCLE_STATUSES)[number];

export type LeadReportInput = {
  lifecycleStatus: string;
  quality: string | null;
  sourceId: string | null;
  sourceName: string | null;
  ownerMembershipId: string | null;
  ownerName: string | null;
  stageName: string;
  city: string | null;
  estimatedValueMinor: number | null;
};

export type LeadReportView = {
  generatedAt: string;
  totals: {
    total: number;
    open: number;
    won: number;
    lost: number;
    unqualified: number;
    recycled: number;
    unassigned: number;
    estimatedValueMinor: number;
    wonValueMinor: number;
    winRateBps: number | null;
  };
  byLifecycle: Array<{ status: string; count: number; valueMinor: number }>;
  byQuality: Array<{ quality: string; count: number }>;
  bySource: Array<{ sourceId: string | null; name: string | null; count: number; valueMinor: number }>;
  byOwner: Array<{
    membershipId: string | null;
    name: string | null;
    total: number;
    open: number;
    won: number;
    lost: number;
    valueMinor: number;
  }>;
  byStage: Array<{ stageName: string; count: number; valueMinor: number }>;
  byCity: Array<{ city: string; count: number }>;
};

function emptyLifecycle(): Record<LeadLifecycleCode, { count: number; valueMinor: number }> {
  return {
    open: { count: 0, valueMinor: 0 },
    won: { count: 0, valueMinor: 0 },
    lost: { count: 0, valueMinor: 0 },
    unqualified: { count: 0, valueMinor: 0 },
    recycled: { count: 0, valueMinor: 0 },
  };
}

export function summarizeLeads(rows: LeadReportInput[], generatedAt = new Date()): LeadReportView {
  const lifecycle = emptyLifecycle();
  const byQuality = new Map<string, number>();
  const bySource = new Map<string, { sourceId: string | null; name: string | null; count: number; valueMinor: number }>();
  const byOwner = new Map<
    string,
    {
      membershipId: string | null;
      name: string | null;
      total: number;
      open: number;
      won: number;
      lost: number;
      valueMinor: number;
    }
  >();
  const byStage = new Map<string, { stageName: string; count: number; valueMinor: number }>();
  const byCity = new Map<string, number>();
  let unassigned = 0;
  let estimatedValueMinor = 0;

  for (const row of rows) {
    const value = row.estimatedValueMinor ?? 0;
    estimatedValueMinor += value;
    if ((LEAD_LIFECYCLE_STATUSES as readonly string[]).includes(row.lifecycleStatus)) {
      const bucket = lifecycle[row.lifecycleStatus as LeadLifecycleCode];
      bucket.count += 1;
      bucket.valueMinor += value;
    }
    if (row.quality) {
      byQuality.set(row.quality, (byQuality.get(row.quality) ?? 0) + 1);
    }
    const sourceKey = row.sourceId ?? 'none';
    const source = bySource.get(sourceKey) ?? {
      sourceId: row.sourceId,
      name: row.sourceName,
      count: 0,
      valueMinor: 0,
    };
    source.count += 1;
    source.valueMinor += value;
    bySource.set(sourceKey, source);

    if (!row.ownerMembershipId) {
      unassigned += 1;
    }
    const ownerKey = row.ownerMembershipId ?? 'unassigned';
    const owner = byOwner.get(ownerKey) ?? {
      membershipId: row.ownerMembershipId,
      name: row.ownerName,
      total: 0,
      open: 0,
      won: 0,
      lost: 0,
      valueMinor: 0,
    };
    owner.total += 1;
    owner.valueMinor += value;
    if (row.lifecycleStatus === 'open') {
      owner.open += 1;
    }
    if (row.lifecycleStatus === 'won') {
      owner.won += 1;
    }
    if (row.lifecycleStatus === 'lost') {
      owner.lost += 1;
    }
    byOwner.set(ownerKey, owner);

    const stage = byStage.get(row.stageName) ?? { stageName: row.stageName, count: 0, valueMinor: 0 };
    stage.count += 1;
    stage.valueMinor += value;
    byStage.set(row.stageName, stage);

    const city = row.city?.trim();
    if (city) {
      byCity.set(city, (byCity.get(city) ?? 0) + 1);
    }
  }

  const decided = lifecycle.won.count + lifecycle.lost.count;
  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      total: rows.length,
      open: lifecycle.open.count,
      won: lifecycle.won.count,
      lost: lifecycle.lost.count,
      unqualified: lifecycle.unqualified.count,
      recycled: lifecycle.recycled.count,
      unassigned,
      estimatedValueMinor,
      wonValueMinor: lifecycle.won.valueMinor,
      winRateBps: decided === 0 ? null : Math.round((lifecycle.won.count / decided) * 10000),
    },
    byLifecycle: LEAD_LIFECYCLE_STATUSES.map((status) => ({
      status,
      count: lifecycle[status].count,
      valueMinor: lifecycle[status].valueMinor,
    })),
    byQuality: [...byQuality.entries()]
      .map(([quality, count]) => ({ quality, count }))
      .sort((a, b) => b.count - a.count || a.quality.localeCompare(b.quality)),
    bySource: [...bySource.values()].sort((a, b) => b.count - a.count),
    byOwner: [...byOwner.values()].sort((a, b) => b.won - a.won || b.total - a.total),
    byStage: [...byStage.values()].sort((a, b) => b.count - a.count),
    byCity: [...byCity.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };
}
