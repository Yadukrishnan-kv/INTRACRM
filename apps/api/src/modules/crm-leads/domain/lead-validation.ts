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

import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Business default country: bare national numbers (no country code) are assumed
// to be Indian, matching this tenant base's primary market.
const DEFAULT_PHONE_COUNTRY = 'IN';

export type PhoneParse = { ok: true; value: string | null } | { ok: false };

/**
 * Accepts any internationally valid phone number (with or without a leading
 * `+`), plus bare national numbers which are assumed to belong to
 * DEFAULT_PHONE_COUNTRY. Always normalizes to E.164 (e.g. "+919876543210").
 */
export function parseLeadPhone(input?: string | null): PhoneParse {
  if (input == null) {
    return { ok: true, value: null };
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }

  if (trimmed.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed?.isValid()) {
      return { ok: true, value: parsed.number };
    }
  }

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_PHONE_COUNTRY);
  if (parsed?.isValid()) {
    return { ok: true, value: parsed.number };
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
