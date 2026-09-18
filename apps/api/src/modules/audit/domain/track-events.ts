export const TRACK_ACTION = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  assign: 'assign',
  statusChange: 'status_change',
} as const;

export type TrackAction = (typeof TRACK_ACTION)[keyof typeof TRACK_ACTION];

export const TRACK_ACTIONS = Object.values(TRACK_ACTION);

export const TRACK_RESOURCE = {
  lead: 'lead',
  quotation: 'quotation',
  followUp: 'follow_up',
} as const;

export type TrackResource = (typeof TRACK_RESOURCE)[keyof typeof TRACK_RESOURCE];

export const TRACK_RESOURCES = Object.values(TRACK_RESOURCE);

export const TRACK_CATALOG: Array<{
  action: TrackAction;
  name: string;
  description: string;
}> = [
  { action: TRACK_ACTION.create, name: 'Create', description: 'A record was created' },
  { action: TRACK_ACTION.update, name: 'Update', description: 'A record was edited' },
  { action: TRACK_ACTION.delete, name: 'Delete', description: 'A record was soft-deleted' },
  { action: TRACK_ACTION.assign, name: 'Assignments', description: 'Owner or assignee changed' },
  {
    action: TRACK_ACTION.statusChange,
    name: 'Status Changes',
    description: 'Stage or status moved',
  },
];

export function isTrackAction(value: string): value is TrackAction {
  return (TRACK_ACTIONS as string[]).includes(value);
}

export function isTrackResource(value: string): value is TrackResource {
  return (TRACK_RESOURCES as string[]).includes(value);
}

export function labelForTrackAction(action: string): string {
  return TRACK_CATALOG.find((entry) => entry.action === action)?.name ?? action;
}

export type TrackSnapshot = {
  action: string;
  resourceType: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
};

export type TrackReportView = {
  generatedAt: string;
  totals: {
    total: number;
    create: number;
    update: number;
    delete: number;
    assign: number;
    statusChange: number;
  };
  byAction: Array<{ action: string; name: string; count: number }>;
  byResource: Array<{ resourceType: string; count: number }>;
  byActor: Array<{ actorId: string | null; name: string | null; count: number }>;
  byDay: Array<{ date: string; count: number }>;
};

function countAction(rows: TrackSnapshot[], action: TrackAction): number {
  return rows.filter((row) => row.action === action).length;
}

export function summarizeTracks(rows: TrackSnapshot[], now = new Date()): TrackReportView {
  const byActionMap = new Map<string, number>();
  const byResourceMap = new Map<string, number>();
  const byActorMap = new Map<string, { actorId: string | null; name: string | null; count: number }>();
  const byDayMap = new Map<string, number>();
  for (const row of rows) {
    byActionMap.set(row.action, (byActionMap.get(row.action) ?? 0) + 1);
    byResourceMap.set(row.resourceType, (byResourceMap.get(row.resourceType) ?? 0) + 1);
    const actorKey = row.actorId ?? 'system';
    const actor = byActorMap.get(actorKey) ?? {
      actorId: row.actorId,
      name: row.actorName,
      count: 0,
    };
    actor.count += 1;
    byActorMap.set(actorKey, actor);
    const day = row.createdAt.toISOString().slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
  }
  return {
    generatedAt: now.toISOString(),
    totals: {
      total: rows.length,
      create: countAction(rows, TRACK_ACTION.create),
      update: countAction(rows, TRACK_ACTION.update),
      delete: countAction(rows, TRACK_ACTION.delete),
      assign: countAction(rows, TRACK_ACTION.assign),
      statusChange: countAction(rows, TRACK_ACTION.statusChange),
    },
    byAction: TRACK_CATALOG.map((entry) => ({
      action: entry.action,
      name: entry.name,
      count: byActionMap.get(entry.action) ?? 0,
    })),
    byResource: [...byResourceMap.entries()]
      .map(([resourceType, count]) => ({ resourceType, count }))
      .sort((left, right) => right.count - left.count),
    byActor: [...byActorMap.values()].sort((left, right) => right.count - left.count).slice(0, 20),
    byDay: [...byDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  };
}
