import type { FollowUpType, Lead, LeadDetail } from './types';

/** Editable lead fields as typed in the form (strings, rupees). */
export type LeadFormState = {
  title: string;
  customerName: string;
  primaryPhone: string;
  primaryEmail: string;
  city: string;
  requirement: string;
  sourceId: string;
  quality: string;
  estimatedValue: string;
  ownerMembershipId: string;
  followUpType: FollowUpType;
  followUpDueAt: string; // datetime-local value
  followUpNotes: string;
};

export const EMPTY_LEAD_FORM: LeadFormState = {
  title: '',
  customerName: '',
  primaryPhone: '',
  primaryEmail: '',
  city: '',
  requirement: '',
  sourceId: '',
  quality: '',
  estimatedValue: '',
  ownerMembershipId: '',
  followUpType: 'call',
  followUpDueAt: '',
  followUpNotes: '',
};

export function formFromLead(lead: LeadDetail): LeadFormState {
  return {
    ...EMPTY_LEAD_FORM,
    title: lead.title,
    customerName: lead.customerName ?? '',
    primaryPhone: lead.primaryPhone ?? '',
    primaryEmail: lead.primaryEmail ?? '',
    city: lead.city ?? '',
    requirement: lead.requirement ?? '',
    sourceId: lead.sourceId ?? '',
    quality: lead.quality ?? '',
    estimatedValue: lead.estimatedValueMinor == null ? '' : String(Math.round(lead.estimatedValueMinor / 100)),
    ownerMembershipId: lead.ownerMembershipId ?? '',
  };
}

const E164 = /^\+[1-9][0-9]{7,14}$/;
const IN_MOBILE = /^[6-9]\d{9}$/;
const IN_WITH_CC = /^91[6-9]\d{9}$/;

/** Same rule as the mobile form and the API's parseLeadPhone. */
export function phoneError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, '');
  if (E164.test(trimmed) || IN_MOBILE.test(digits) || IN_WITH_CC.test(digits)) return undefined;
  return 'Use E.164 or a 10-digit mobile number';
}

export function emailError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? undefined : 'Enter a valid email';
}

/** Parses typed rupees. `null` = blank, `undefined` = invalid. */
export function parseRupees(value: string): number | null | undefined {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return undefined;
  return Math.round(Number(trimmed) * 100);
}

export function validateLeadForm(form: LeadFormState, isEdit: boolean, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = form.title.trim();
  if (title.length < 2) errors.title = 'Title must be at least 2 characters';
  else if (title.length > 160) errors.title = 'Title is too long';
  if (form.customerName.trim().length > 120) errors.customerName = 'Customer name is too long';
  const phone = phoneError(form.primaryPhone);
  if (phone) errors.primaryPhone = phone;
  const email = emailError(form.primaryEmail);
  if (email) errors.primaryEmail = email;
  if (form.city.trim().length > 80) errors.city = 'City is too long';
  if (form.requirement.length > 2000) errors.requirement = 'Requirement is too long';
  if (parseRupees(form.estimatedValue) === undefined) errors.estimatedValueMinor = 'Estimated value must be 0 or more';
  if (!isEdit && !form.ownerMembershipId) errors.ownerMembershipId = 'Assigned staff is required';
  if (!isEdit && form.followUpDueAt) {
    const due = new Date(form.followUpDueAt);
    if (Number.isNaN(due.getTime())) errors['followUp.dueAt'] = 'Pick a valid date and time';
    else if (due.getTime() < now.getTime() - 60_000) errors['followUp.dueAt'] = 'Follow-up must be in the future';
  }
  if (!isEdit && form.followUpNotes.length > 2000) errors['followUp.notes'] = 'Notes are too long';
  return errors;
}

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** POST /leads body: blank fields are left out (an empty email fails validation). */
export function createLeadBody(form: LeadFormState): Record<string, unknown> {
  const body: Record<string, unknown> = { title: form.title.trim() };
  const optional: Array<[string, string | null]> = [
    ['customerName', blank(form.customerName)],
    ['primaryPhone', blank(form.primaryPhone)],
    ['primaryEmail', blank(form.primaryEmail)],
    ['city', blank(form.city)],
    ['requirement', blank(form.requirement)],
    ['sourceId', blank(form.sourceId)],
    ['quality', blank(form.quality)],
    ['ownerMembershipId', blank(form.ownerMembershipId)],
  ];
  for (const [key, value] of optional) if (value !== null) body[key] = value;
  const value = parseRupees(form.estimatedValue);
  if (typeof value === 'number') body.estimatedValueMinor = value;
  if (form.followUpDueAt) {
    const due = new Date(form.followUpDueAt);
    if (!Number.isNaN(due.getTime())) {
      body.followUp = {
        dueAt: due.toISOString(),
        type: form.followUpType,
        ...(blank(form.followUpNotes) ? { notes: form.followUpNotes.trim() } : {}),
      };
    }
  }
  return body;
}

/**
 * PATCH /leads/:id body. Cleared fields go out as null so the server clears
 * them; ownership is only sent when set (unassigning is not an edit).
 */
export function updateLeadBody(form: LeadFormState, version: number): Record<string, unknown> {
  const value = parseRupees(form.estimatedValue);
  return {
    title: form.title.trim(),
    customerName: blank(form.customerName),
    primaryPhone: blank(form.primaryPhone),
    primaryEmail: blank(form.primaryEmail),
    city: blank(form.city),
    requirement: blank(form.requirement),
    sourceId: blank(form.sourceId),
    quality: blank(form.quality),
    estimatedValueMinor: typeof value === 'number' ? value : null,
    ...(blank(form.ownerMembershipId) ? { ownerMembershipId: form.ownerMembershipId } : {}),
    version,
  };
}

export function displayName(lead: Pick<Lead, 'customerName' | 'title'>): string {
  return lead.customerName && lead.customerName.trim() ? lead.customerName : lead.title;
}

/** Fills {{customer_name}}-style placeholders the same way the mobile composer does. */
export function fillMessageTemplate(
  body: string,
  lead: Pick<Lead, 'customerName' | 'title' | 'leadNumber' | 'city'>,
  staffName = 'INTRA LEADS',
): string {
  return body
    .replace(/\{\{\s*customer_name\s*\}\}/g, displayName(lead).trim())
    .replace(/\{\{\s*lead_title\s*\}\}/g, lead.title)
    .replace(/\{\{\s*lead_number\s*\}\}/g, lead.leadNumber)
    .replace(/\{\{\s*staff_name\s*\}\}/g, staffName)
    .replace(/\{\{\s*city\s*\}\}/g, lead.city ?? '');
}

const LAUNCHABLE = new Set(['tel:', 'sms:', 'smsto:', 'https:']);

/** Server-built launch URIs are only opened for tel/sms/https (wa.me), like the mobile launcher. */
export function safeLaunchUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    return LAUNCHABLE.has(parsed.protocol) ? uri : null;
  } catch {
    return null;
  }
}

export type LeadScope = 'all' | 'mine' | 'unassigned';

/** "Unassigned" has no API filter, so (as on mobile) it narrows the loaded rows. */
export function applyScope<T extends Pick<Lead, 'ownerMembershipId'>>(items: T[], scope: LeadScope, membershipId: string | null | undefined): T[] {
  if (scope === 'unassigned') return items.filter((l) => !l.ownerMembershipId);
  if (scope === 'mine') return items.filter((l) => !!membershipId && l.ownerMembershipId === membershipId);
  return items;
}

export function qualityTone(quality: string | null | undefined): string {
  switch (quality) {
    case 'very_hot':
    case 'hot':
    case 'vip':
      return 'danger';
    case 'warm':
    case 'qualified':
      return 'warning';
    case 'cold':
    case 'lukewarm':
    case 'nurture':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Stepper position: index of the current stage, or the Lost stage when lost. */
export function stepperIndex(stages: Array<{ name: string; isLost?: boolean }>, current: string, lost: boolean): number {
  if (lost) {
    const lostIdx = stages.findIndex((s) => s.isLost);
    return lostIdx >= 0 ? lostIdx : stages.length - 1;
  }
  const idx = stages.findIndex((s) => s.name.toLowerCase() === current.toLowerCase());
  return idx < 0 ? 0 : idx;
}

/** Maps API field validation errors (RFC 7807 `errors[]`) onto form keys. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const list = (error as { errors?: Array<{ field?: string; message?: string }> } | null)?.errors;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (item.field && item.message && !out[item.field]) out[item.field] = item.message;
  }
  return out;
}

/** Mobile pre-selects the first staff member as owner on create. */
export function defaultOwner(staff: Array<{ id: string }>, current: string): string {
  if (current) return current;
  return staff[0]?.id ?? '';
}

/** "5m ago" / "3h ago" / "2d ago", as on the mobile lead card. */
export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 60) return `${Math.min(Math.max(minutes, 1), 59)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export type StageMoveCheck =
  | { ok: true; needsLossReason: boolean }
  | { ok: false; reason: 'same' | 'unknown' | 'no_loss_reasons' };

/** Validates a stage move the way the mobile board/detail do before calling the API. */
export function checkStageMove(
  stages: Array<{ id: string; isLost: boolean }>,
  fromStageId: string,
  toStageId: string,
  lossReasonCount: number,
): StageMoveCheck {
  if (fromStageId === toStageId) return { ok: false, reason: 'same' };
  const stage = stages.find((s) => s.id === toStageId);
  if (!stage) return { ok: false, reason: 'unknown' };
  if (stage.isLost && lossReasonCount === 0) return { ok: false, reason: 'no_loss_reasons' };
  return { ok: true, needsLossReason: stage.isLost };
}

/** Optimistically moves a card between board columns (counts and value follow). */
export function moveCard<
  C extends { id: string; stageId: string; stageName: string; estimatedValueMinor: number | null },
  Col extends { stage: { id: string; name: string }; count: number; valueMinor: number; leads: C[] },
>(columns: Col[], cardId: string, toStageId: string): Col[] {
  let card: C | undefined;
  for (const col of columns) {
    const found = col.leads.find((l) => l.id === cardId);
    if (found) card = found;
  }
  if (!card || card.stageId === toStageId) return columns;
  const value = card.estimatedValueMinor ?? 0;
  const moved = card;
  return columns.map((col) => {
    if (col.stage.id === moved.stageId) {
      return { ...col, count: Math.max(0, col.count - 1), valueMinor: col.valueMinor - value, leads: col.leads.filter((l) => l.id !== cardId) };
    }
    if (col.stage.id === toStageId) {
      return {
        ...col,
        count: col.count + 1,
        valueMinor: col.valueMinor + value,
        leads: [{ ...moved, stageId: toStageId, stageName: col.stage.name }, ...col.leads],
      };
    }
    return col;
  });
}

/** Fallback when /timeline/catalog is unavailable (same list the mobile app ships). */
export const TIMELINE_CATALOG: Array<{ code: string; title: string }> = [
  { code: 'lead_created', title: 'Lead Created' },
  { code: 'lead_updated', title: 'Lead Updated' },
  { code: 'status_changed', title: 'Status Changed' },
  { code: 'follow_up_added', title: 'Follow-up Added' },
  { code: 'quotation_sent', title: 'Quotation Sent' },
  { code: 'site_visit_added', title: 'Site Visit Added' },
  { code: 'warranty_issued', title: 'Warranty Issued' },
  { code: 'call_started', title: 'Call' },
  { code: 'whatsapp_sent', title: 'WhatsApp' },
  { code: 'sms_sent', title: 'SMS' },
  { code: 'customer_synced', title: 'Customer Synced' },
  { code: 'invoice_synced', title: 'Invoice Synced' },
  { code: 'payment_received', title: 'Payment Received' },
];

const TIMELINE_ICONS: Record<string, string> = {
  lead_created: '➕',
  lead_updated: '✎',
  status_changed: '⇄',
  follow_up_added: '📅',
  quotation_sent: '₹',
  site_visit_added: '📍',
  warranty_issued: '✔',
  call_started: '📞',
  whatsapp_sent: '💬',
  sms_sent: '✉',
  customer_synced: '⟳',
  invoice_synced: '🧾',
  payment_received: '💰',
  note: '📝',
  call: '📞',
  email: '✉',
  meeting: '👥',
  sms: '✉',
  whatsapp: '💬',
};

export function timelineIcon(code: string): string {
  return TIMELINE_ICONS[code] ?? '•';
}

/** Search chips, same order as mobile; `null` = let the server classify. */
export const SEARCH_FIELDS: Array<{ code: SearchFieldCode | null; label: string }> = [
  { code: null, label: 'Auto' },
  { code: 'customer', label: 'Customer' },
  { code: 'mobile', label: 'Mobile' },
  { code: 'lead_id', label: 'Lead ID' },
  { code: 'quotation_number', label: 'Quotation Number' },
];
type SearchFieldCode = 'customer' | 'mobile' | 'lead_id' | 'quotation_number';

/** Search runs from 2 typed characters, like mobile. */
export function canSearch(q: string): boolean {
  return q.trim().length >= 2;
}

export function searchHitPath(hit: { type: string; id: string; leadId: string; quotationId: string | null }): string {
  if (hit.type === 'quotation') return `/quotations/${encodeURIComponent(hit.quotationId ?? hit.id)}`;
  return `/leads/${encodeURIComponent(hit.leadId)}`;
}

/** Comms result → what the UI should do next (mirrors LeadCommsBar._send). */
export function commsOutcome(result: { mode: string; launchUri: string | null; warning: string | null; channel: string }):
  | { kind: 'launch'; uri: string; warning: string | null }
  | { kind: 'toast'; message: string | null; warning: string | null } {
  const uri = safeLaunchUri(result.launchUri);
  if (uri && result.mode !== 'sent') return { kind: 'launch', uri, warning: result.warning };
  if (result.warning) return { kind: 'toast', message: null, warning: result.warning };
  return { kind: 'toast', message: result.channel === 'call' ? 'Call connecting…' : 'Message sent', warning: null };
}
