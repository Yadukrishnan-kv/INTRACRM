// Date-range presets for report filters. Pure functions so they are unit-testable.

export type PresetKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'custom';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'thisYear', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

export function isPresetKey(value: string | null): value is PresetKey {
  return PRESETS.some((p) => p.key === value);
}

/** Inclusive calendar-day range, YYYY-MM-DD in the viewer's local time. */
export type YmdRange = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-midnight Date for a YYYY-MM-DD string; null when malformed. */
export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || toYmd(d) !== ymd ? null : d;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** The calendar range a preset covers relative to `now`; null = no date filter. */
export function presetRange(preset: PresetKey, now: Date, custom?: Partial<YmdRange>): YmdRange | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = today.getFullYear();
  const m = today.getMonth();
  const range = (from: Date, to: Date): YmdRange => ({ from: toYmd(from), to: toYmd(to) });
  switch (preset) {
    case 'all':
      return null;
    case 'today':
      return range(today, today);
    case 'yesterday':
      return range(addDays(today, -1), addDays(today, -1));
    case 'last7':
      return range(addDays(today, -6), today);
    case 'last30':
      return range(addDays(today, -29), today);
    case 'thisMonth':
      return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'lastMonth':
      return range(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return range(new Date(y, q, 1), new Date(y, q + 3, 0));
    }
    case 'thisYear':
      return range(new Date(y, 0, 1), new Date(y, 11, 31));
    case 'custom': {
      const from = custom?.from && parseYmd(custom.from) ? custom.from : undefined;
      const to = custom?.to && parseYmd(custom.to) ? custom.to : undefined;
      if (!from && !to) return null;
      // An open end is fine for the API; fill it so the range stays well-formed.
      return { from: from ?? '1970-01-01', to: to ?? toYmd(today) };
    }
  }
}

/**
 * How an endpoint reads from/to:
 * - 'instant': ISO timestamps, `to` exclusive (leads, follow-ups, quotations, sales, site visits, tracks).
 * - 'ymd': calendar dates, `to` inclusive (attendance, targets, incentives).
 */
export type DateMode = 'instant' | 'ymd';

export function rangeToQuery(range: YmdRange | null, mode: DateMode): { from?: string; to?: string } {
  if (!range) return {};
  if (mode === 'ymd') return { from: range.from, to: range.to };
  const from = parseYmd(range.from);
  const to = parseYmd(range.to);
  return {
    ...(from ? { from: from.toISOString() } : {}),
    ...(to ? { to: addDays(to, 1).toISOString() } : {}),
  };
}

export function describeRange(range: YmdRange | null): string {
  if (!range) return 'All time';
  return range.from === range.to ? range.from : `${range.from} → ${range.to}`;
}
