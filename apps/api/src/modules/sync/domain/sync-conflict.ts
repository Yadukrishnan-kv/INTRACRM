export const SYNC_RESOURCE = {
  lead: 'lead',
  note: 'note',
  followUp: 'follow_up',
} as const;

export type SyncResource = (typeof SYNC_RESOURCE)[keyof typeof SYNC_RESOURCE];

export const NOTE_ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'sms', 'whatsapp'] as const;

export const SERVER_WINS_LEAD_FIELDS = [
  'ownerMembershipId',
  'lifecycleStatus',
  'stageId',
  'stageName',
] as const;

export const MERGE_LEAD_FIELDS = [
  'title',
  'customerName',
  'primaryPhone',
  'primaryEmail',
  'city',
  'requirement',
] as const;

export type JsonRecord = Record<string, unknown>;

export function mergeLeadConflict(local: JsonRecord, server: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...server };
  for (const field of MERGE_LEAD_FIELDS) {
    if (local[field] != null && local[field] !== server[field]) {
      merged[field] = local[field];
    }
  }
  for (const field of SERVER_WINS_LEAD_FIELDS) {
    if (server[field] !== undefined) {
      merged[field] = server[field];
    }
  }
  merged.version = server.version;
  merged.updatedAt = server.updatedAt;
  return merged;
}

export function mergeFollowUpConflict(local: JsonRecord, server: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...server };
  if (server.status === 'completed' || server.status === 'cancelled') {
    return merged;
  }
  if (typeof local.notes === 'string' && local.notes !== server.notes) {
    merged.notes = mergeNotes(asString(server.notes), local.notes);
  }
  if (local.dueAt && local.dueAt !== server.dueAt) {
    merged.dueAt = local.dueAt;
  }
  if (typeof local.title === 'string' && local.title.trim() !== '') {
    merged.title = local.title;
  }
  merged.version = server.version;
  return merged;
}

export function mergeNotes(server: string | null, local: string): string {
  if (!server || server.trim() === '' || server === local) {
    return local;
  }
  if (server.includes(local)) {
    return server;
  }
  return `${server.trim()}\n${local.trim()}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
