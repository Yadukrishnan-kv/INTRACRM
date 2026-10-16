// Pure helpers for the field feature (unit tested in logic.test.ts).
import type {
  AttendanceDayStatus,
  CreateSiteVisitBody,
  GeoPoint,
  PipelineBoard,
  SiteVisit,
  SiteVisitStatus,
} from './types';

// ---------- Site visits ----------

export const VISIT_STATUS_LABELS: Record<SiteVisitStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export const VISIT_STATUS_TONE: Record<SiteVisitStatus, string> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'neutral',
};

/** Filter chips, in the same order as the mobile list. Default is "scheduled". */
export const VISIT_FILTERS = ['all', 'overdue', 'scheduled', 'in_progress', 'completed'] as const;
export type VisitFilter = (typeof VISIT_FILTERS)[number];

export function parseVisitFilter(value: string | null): VisitFilter {
  return (VISIT_FILTERS as readonly string[]).includes(value ?? '') ? (value as VisitFilter) : 'scheduled';
}

export function visitFilterLabel(filter: VisitFilter): string {
  if (filter === 'all') return 'All';
  if (filter === 'overdue') return 'Overdue';
  return VISIT_STATUS_LABELS[filter];
}

export function visitFilterQuery(filter: VisitFilter): { status?: SiteVisitStatus; overdue?: boolean } {
  if (filter === 'all') return {};
  if (filter === 'overdue') return { overdue: true };
  return { status: filter };
}

export function visitTitle(v: Pick<SiteVisit, 'purpose' | 'leadTitle' | 'customerName'>): string {
  return v.purpose?.trim() ? v.purpose : (v.leadTitle ?? v.customerName ?? 'Site visit');
}

export function visitAddress(v: Pick<SiteVisit, 'addressLine1' | 'city' | 'state' | 'postalCode'>): string {
  return [v.addressLine1, v.city, v.state, v.postalCode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ');
}

export function isOverdue(v: Pick<SiteVisit, 'status' | 'scheduledAt'>, now = new Date()): boolean {
  return v.status === 'scheduled' && new Date(v.scheduledAt).getTime() < now.getTime();
}

export type VisitActions = {
  checkIn: boolean;
  checkOut: boolean;
  capture: boolean; // notes, feedback, photos
  complete: boolean;
  cancel: boolean;
  noShow: boolean;
};

/** Mirrors canCheckIn/canCheckOut/... in apps/api site-visit-types.ts. */
export function visitActions(status: SiteVisitStatus, canComplete: boolean): VisitActions {
  const open = status === 'scheduled' || status === 'in_progress';
  return {
    checkIn: canComplete && status === 'scheduled',
    checkOut: canComplete && status === 'in_progress',
    capture: canComplete && open,
    complete: canComplete && open,
    cancel: canComplete && open,
    noShow: canComplete && status === 'scheduled',
  };
}

export function geoLabel(p: GeoPoint | null | undefined): string {
  if (!p) return '—';
  const acc = p.accuracyMeters != null ? ` (±${Math.round(p.accuracyMeters)} m)` : '';
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}${acc}`;
}

export function mapsUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
}

export type VisitDraft = {
  leadId: string;
  scheduledAt: string; // ISO or ''
  purpose: string;
  notes: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  assignedToMembershipId: string;
  location: GeoPoint | null;
};

const LIMITS: Partial<Record<keyof VisitDraft, number>> = {
  purpose: 160,
  notes: 2000,
  addressLine1: 160,
  city: 80,
  state: 80,
  postalCode: 20,
};

export function validateVisitDraft(d: VisitDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.leadId) errors.leadId = 'Select a lead.';
  if (!d.scheduledAt || Number.isNaN(new Date(d.scheduledAt).getTime())) errors.scheduledAt = 'Pick a date and time.';
  for (const [key, max] of Object.entries(LIMITS) as Array<[keyof VisitDraft, number]>) {
    const value = d[key];
    if (typeof value === 'string' && value.trim().length > max) errors[key] = `Keep it under ${max} characters.`;
  }
  return errors;
}

export function toCreateVisitBody(d: VisitDraft): CreateSiteVisitBody {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    leadId: d.leadId,
    scheduledAt: new Date(d.scheduledAt).toISOString(),
    purpose: opt(d.purpose),
    notes: opt(d.notes),
    addressLine1: opt(d.addressLine1),
    city: opt(d.city),
    state: opt(d.state),
    postalCode: opt(d.postalCode),
    assignedToMembershipId: opt(d.assignedToMembershipId),
    scheduledLocation: d.location ?? undefined,
  };
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 12;

/** Content type the API accepts for a picked file, or null if unsupported. */
export function photoContentType(file: { type: string; name: string }): string | null {
  const type = file.type.toLowerCase();
  if ((PHOTO_TYPES as readonly string[]).includes(type)) return type;
  if (type === 'image/jpg') return 'image/jpeg';
  const name = file.name.toLowerCase();
  if (!type) {
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  }
  return null;
}

export function photoProblem(file: { type: string; name: string; size: number }, currentCount: number): string | null {
  if (currentCount >= MAX_PHOTOS) return `A visit can have at most ${MAX_PHOTOS} photos.`;
  if (!photoContentType(file)) return 'Use a JPEG, PNG or WebP image.';
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return 'Photo is empty or larger than 5 MB.';
  return null;
}

export function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

// ---------- Attendance ----------

export const ATTENDANCE_LABELS: Record<AttendanceDayStatus, string> = {
  present: 'Present',
  late: 'Late',
  open: 'Punched in',
  absent: 'Absent',
};

export const ATTENDANCE_TONE: Record<AttendanceDayStatus, string> = {
  present: 'success',
  late: 'warning',
  open: 'info',
  absent: 'neutral',
};

export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${rest}m`;
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** yyyy-mm-dd in local time. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftYmd(value: string, days: number): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return ymd(date);
}

/** Default history window: the last 14 days ending today (same as the API default). */
export function defaultAttendanceRange(today = new Date()): { from: string; to: string } {
  const to = ymd(today);
  return { from: shiftYmd(to, -13), to };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an error message for an invalid yyyy-mm-dd range, or null. Max 92 days. */
export function validateRange(from: string, to: string): string | null {
  if (!YMD.test(from) || !YMD.test(to)) return 'Pick both dates.';
  if (from > to) return '"To" must be on or after "From".';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > 92) return 'Pick a range of at most 92 days.';
  return null;
}

// ---------- Pipeline ----------

/** Returns a copy of the board with the card moved to `stageId` (optimistic update). */
export function moveCard(board: PipelineBoard, cardId: string, stageId: string): PipelineBoard {
  const source = board.columns.find((c) => c.leads.some((l) => l.id === cardId));
  const target = board.columns.find((c) => c.stage.id === stageId);
  if (!source || !target || source === target) return board;
  const card = source.leads.find((l) => l.id === cardId)!;
  const value = card.estimatedValueMinor ?? 0;
  const moved = { ...card, stageId: target.stage.id, stageName: target.stage.name };
  return {
    ...board,
    columns: board.columns.map((c) => {
      if (c === source) {
        return { ...c, count: c.count - 1, valueMinor: c.valueMinor - value, leads: c.leads.filter((l) => l.id !== cardId) };
      }
      if (c === target) {
        return { ...c, count: c.count + 1, valueMinor: c.valueMinor + value, leads: [moved, ...c.leads] };
      }
      return c;
    }),
  };
}
