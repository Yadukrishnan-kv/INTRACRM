export const LEAD_QUALITIES = ['hot', 'warm', 'cold'] as const;
export type LeadQualityCode = (typeof LEAD_QUALITIES)[number];

export const USER_ACTIVITY_TYPES = [
  'note',
  'call',
  'email',
  'meeting',
  'sms',
  'whatsapp',
] as const;
export type UserActivityType = (typeof USER_ACTIVITY_TYPES)[number];

const E164 = /^\+[1-9][0-9]{7,14}$/;
const IN_MOBILE = /^[6-9]\d{9}$/;
const IN_WITH_CC = /^91[6-9]\d{9}$/;

export type PhoneParse = { ok: true; value: string | null } | { ok: false };

export function parseLeadPhone(input?: string | null): PhoneParse {
  if (input == null) {
    return { ok: true, value: null };
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (E164.test(trimmed)) {
    return { ok: true, value: trimmed };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (IN_MOBILE.test(digits)) {
    return { ok: true, value: `+91${digits}` };
  }
  if (IN_WITH_CC.test(digits)) {
    return { ok: true, value: `+${digits}` };
  }
  return { ok: false };
}

export function parseEstimatedValueMinor(value?: number | null): number | null {
  if (value == null) {
    return null;
  }
  return Math.trunc(value);
}

export function toMinorNumber(value: bigint | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return Number(value);
}

export function changedLeadFields(
  before: Record<string, string | number | null | undefined>,
  after: Record<string, string | number | null | undefined>,
): string[] {
  return Object.keys(after).filter((key) => (before[key] ?? null) !== (after[key] ?? null));
}
